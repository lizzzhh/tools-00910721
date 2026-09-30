import { hashSeed, normal, randomStreams, uniform } from './random.ts'

/**
 * A synthetic market for the paper-trading game, generated from a fixed seed.
 *
 * The rule that shapes this file is that the price at any instant has to be a
 * pure function of `(seed, day, second)`. Nothing is carried from one call to
 * the next, and no bar is ever produced by walking forward from the beginning of
 * time. That is what makes a seeded market usable in a game: the chart can ask
 * for the last 300 one-hour bars without generating the two years in front of
 * them, a reload shows the same candles, and every reader of the site sees the
 * same market.
 *
 * It is also what keeps the timeframes honest. A one-hour bar and the day bar
 * containing it are not two independent draws that happen to look similar: they
 * are two views of one path, so the day's high cannot disagree with the highest
 * hour inside it.
 *
 * The model, in the order the code applies it:
 *
 * - Prices live in log space, so a candle can never print a negative price no
 *   matter how violent the step before it was.
 * - A day's open is the previous day's close, because this market trades 24×7
 *   and never gaps at the open.
 * - Volatility is mean-reverting in log space, which is what produces the calm
 *   stretches and the wild ones that a plain random walk never has.
 * - A slow trend rides on top of the drift, so the market goes somewhere instead
 *   of only wandering.
 * - Large one-sided jumps are added on top, because real daily returns are
 *   fat-tailed and a normal distribution is not.
 * - Inside a day the path is a Brownian bridge pinned to that day's open and
 *   close, which is the honest way to draw a path whose two ends are already
 *   fixed: a random walk with the drift its own endpoint error implies removed.
 * - Volume rises with the size of the move, and follows the same intraday
 *   activity curve as the volatility, so a quiet hour is a quiet hour in both.
 *
 * One seam is deliberate. A bar shorter than a minute is drawn on a one-second
 * path and a bar of a minute or more on a one-minute path, so a thirty-second
 * candle can see a spike that its containing minute cannot. The same goes
 * between the finest and coarsest grids on very long histories. Every other pair
 * of timeframes agrees exactly, bar for bar.
 */

export type Timeframe =
  | '1s'
  | '5s'
  | '10s'
  | '15s'
  | '30s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '1w'

/** Finest first, so a menu can list them and a check can find the boundaries. */
export const timeframes: Timeframe[] = [
  '1s',
  '5s',
  '10s',
  '15s',
  '30s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '1w'
]

/** How many seconds one bar of each timeframe holds. */
export const timeframeSeconds: Record<Timeframe, number> = {
  '1s': 1,
  '5s': 5,
  '10s': 10,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
  '1w': 604800
}

export function isTimeframe(value: string): value is Timeframe {
  return Object.prototype.hasOwnProperty.call(timeframeSeconds, value)
}

/**
 * One bar. Prices are rounded to the tick, and `time` is the UTC millisecond the
 * bar opens at.
 *
 * ECharts wants a candle as `[open, close, low, high]` in that order, which is
 * not the order anyone reads them in, so the conversion lives in the chart
 * module rather than being forced on the data.
 */
export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const secondsPerMinute = 60
const secondsPerDay = 86400
const msPerSecond = 1000
const msPerMinute = 60 * msPerSecond
const msPerDay = secondsPerDay * msPerSecond
const minutesPerDay = msPerDay / msPerMinute

/**
 * Where the market's history begins. A fixed date rather than `Date.now()`,
 * because a market whose past moves with the reader is not the same market
 * twice, and the seed would stop meaning anything.
 */
export const marketEpoch = Date.UTC(2024, 0, 1)

/** The seed the game ships with, so every reader plays the same market. */
export const defaultSeed = 'code-space:market/v1'

/** What the first candle of all time opens at. */
/**
 * Quoted at a level where a second of this market is worth several currency
 * units. That is the whole reason the level is not round: at a hundred, a second
 * moves the price by a hundredth of a cent, and no chart can draw a candle out of
 * a movement smaller than its own tick.
 */
export const defaultStartPrice = 64_800

/**
 * The model's knobs, collected as data.
 *
 * They are a value rather than a set of constants so the lab can hand the
 * generator a different market and get a different answer out of it. The
 * published page never does: it passes nothing and runs on {@link marketDefaults},
 * which is why a change here cannot move the market anybody is playing on. The
 * values below are the published ones, and the tests hold them there.
 */
export type MarketParams = {
  /** Prices print to the cent, as a market quoted in dollars would. */
  priceDecimals: number
  /** Daily volatility in log terms. 0.45 annualised, divided by the square root of a year. */
  dailyVolatility: number
  /** Roughly a quarter a year, which trends up without running away. */
  driftPerDay: number
  /** How fast a quiet spell turns into a wild one, in seconds. */
  volatilityHalfLife: number
  /** A calm stretch runs at about 0.6x the baseline volatility. */
  volatilitySpread: number
  /** About six jumps a year, which is the tail a normal distribution cannot make. */
  jumpChancePerDay: number
  /** Smallest daily jump, in log terms. */
  jumpLow: number
  /** Largest daily jump, in log terms. */
  jumpHigh: number
  /** Flash moves inside a day, per day, on top of whatever the bridge does. */
  intradayJumpsPerDay: number
  /** Smallest flash move. */
  intradayJumpLow: number
  /** Largest flash move. */
  intradayJumpHigh: number
  /** How long a busy spell inside a day lasts before it settles again, in seconds. */
  burstHalfLife: number
  /** How often that spell is redrawn, in seconds. */
  burstBlockSeconds: number
  /** A quiet stretch inside a day runs at roughly a third of the busy one. */
  burstSpread: number
  /** Units of the asset traded in a quiet day. */
  baseDailyVolume: number
  /** How much a big move lifts its volume over an ordinary one. */
  volumeMoveBoost: number
  /** How clumpy trades arrive within a step. */
  volumeWobble: number
  /** How many samples a day is cut into. */
  coarseSteps: number
  /**
   * How many samples a second of history is drawn at, and so how many a minute
   * holds. This is what gives a one-second candle a body and a shadow: a second is
   * not one sample but twenty of them, strung between that minute's own open and
   * close, which is also why the sub-minute candles and the minute candle agree
   * about where the minute ended.
   */
  tickRate: number
  /** The three horizons of the slow trend, in days, shortest first. */
  trendPeriods: number[]
  /** How much the trend moves a day at its widest, in log terms. */
  trendAmp: number
  /** How much each horizon counts for less than the one before it. */
  trendDecay: number
  /** How busy a 24x7 market is at the quietest point of the day. */
  activityBase: number
  /**
   * The crowds a 24x7 market gathers: the Asian open, the European afternoon and
   * the US open, each an hour, a size and a width. The same curve scales both the
   * volatility and the volume of a step, which is why a quiet hour looks quiet in
   * both.
   */
  activityPeaks: { hour: number; amp: number; width: number }[]
}

export const marketDefaults: MarketParams = {
  priceDecimals: 2,
  dailyVolatility: 0.45 / Math.sqrt(365),
  driftPerDay: 0.00055,
  volatilityHalfLife: 3 * secondsPerDay,
  volatilitySpread: 0.45,
  jumpChancePerDay: 1 / 60,
  jumpLow: 0.02,
  jumpHigh: 0.09,
  intradayJumpsPerDay: 2,
  intradayJumpLow: 0.003,
  intradayJumpHigh: 0.015,
  burstHalfLife: 20 * 60,
  burstBlockSeconds: 8 * 60,
  burstSpread: 0.8,
  baseDailyVolume: 18_000,
  volumeMoveBoost: 3.5,
  volumeWobble: 0.28,
  coarseSteps: 1440,
  tickRate: 20,
  trendPeriods: [9, 23, 61],
  trendAmp: 0.004,
  trendDecay: 1.4,
  activityBase: 0.72,
  activityPeaks: [
    { hour: 14, amp: 0.5, width: 9 },
    { hour: 8, amp: 0.42, width: 6 },
    { hour: 0, amp: 0.34, width: 5 },
    { hour: 21, amp: 0.3, width: 6 }
  ]
}

/**
 * A finished set of knobs, with anything the caller left out taken from the
 * published market. Unknown keys are dropped and the arrays are copied, so a
 * caller cannot reach in and edit a run that is already under way.
 */
export function resolveParams(overrides?: Partial<MarketParams>): MarketParams {
  if (!overrides) return marketDefaults
  const merged = { ...marketDefaults }
  for (const key of Object.keys(marketDefaults) as (keyof MarketParams)[]) {
    const value = overrides[key]
    if (value === undefined) continue
    if (Array.isArray(marketDefaults[key])) {
      if (Array.isArray(value)) (merged as Record<string, unknown>)[key] = [...(value as unknown[])]
    } else if (typeof value === typeof marketDefaults[key]) {
      ;(merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}

/**
 * What a set of knobs is worth, as a short string.
 *
 * The caches are keyed on this, so a market tuned in the lab cannot be served to
 * the published page out of a path that happens to look like a match, and two
 * differently tuned runs cannot see each other's days. Six decimals is well
 * inside the noise floor of a 64-bit double and short enough to stay readable in
 * a debugger.
 */
export function paramsKey(params: MarketParams): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number') parts.push(`${key}=${value.toFixed(6)}`)
    else parts.push(`${key}=${JSON.stringify(value)}`)
  }
  return parts.join(',')
}

/**
 * The mean-reversion of the daily volatility, and the size of the draw that drives
 * it. Both follow from the half-life, so they are worked out per set of knobs
 * rather than once for the whole module.
 */
function volatilityRates(params: MarketParams) {
  const decay = Math.exp(-secondsPerDay / params.volatilityHalfLife)
  return { decay, shock: params.volatilitySpread * Math.sqrt(1 - decay * decay) }
}

/** The cheapest day a market can ask for, in log terms. */
type MarketDay = {
  open: number
  close: number
  /** Daily volatility, in log terms, and the unit every other figure uses. */
  sigma: number
}

/**
 * A slow trend at three horizons, so the market has swings worth waiting for
 * rather than only noise around a line. The phases come from the seed, which is
 * what makes one market's bull run land somewhere else than another's.
 */
function trendPerDay(seed: number, day: number, params: MarketParams): number {
  let total = 0
  for (let index = 0; index < params.trendPeriods.length; index += 1) {
    const phase = 2 * Math.PI * hashUnit(seed, randomStreams.trend, index)
    total += Math.sin((2 * Math.PI * day) / params.trendPeriods[index] + phase) / (index + params.trendDecay)
  }
  return total * params.trendAmp
}

/** One uniform draw at a coordinate, for the places that need a phase or a coin flip. */
function hashUnit(seed: number, stream: number, a: number, b = 0): number {
  return uniform(seed, stream, a, b)
}

function jumpFor(seed: number, day: number, params: MarketParams): number {
  if (hashUnit(seed, randomStreams.jump, day) >= params.jumpChancePerDay) return 0
  const size = params.jumpLow + (params.jumpHigh - params.jumpLow) * hashUnit(seed, randomStreams.jump, day, 1)
  return (hashUnit(seed, randomStreams.jump, day, 2) < 0.5 ? -1 : 1) * size
}

/**
 * The chain of days, oldest first, from the epoch to `last`.
 *
 * Every day draws a fixed number of values, so the state on any given day is the
 * same no matter how far back the caller asked to start — the price on a
 * Tuesday cannot depend on which week someone wanted to look at.
 */
function marketDays(seed: number, startPrice: number, last: number, params: MarketParams): MarketDay[] {
  const days: MarketDay[] = []
  const { decay, shock } = volatilityRates(params)
  let logPrice = Math.log(startPrice)
  let logVolatility = 0
  for (let day = 0; day <= last; day += 1) {
    logVolatility = decay * logVolatility + shock * normal(seed, randomStreams.volatility, day, 0)
    const sigma = params.dailyVolatility * Math.exp(logVolatility)
    const open = logPrice
    const close =
      open +
      params.driftPerDay +
      trendPerDay(seed, day, params) +
      sigma * normal(seed, randomStreams.price, day, 0) +
      jumpFor(seed, day, params)
    days.push({ open, close, sigma })
    logPrice = close
  }
  return days
}

/**
 * How busy the market is at a point in the day, as a multiplier.
 *
 * A 24×7 market is never empty, but it is not equally busy either: the Asian
 * open, the European afternoon and the US open each bring their own crowd. The
 * same curve scales both the volatility and the volume of a step, which is why
 * a quiet hour looks quiet in both.
 */
function activity(secondOfDay: number, params: MarketParams): number {
  const hour = secondOfDay / 3600
  let total = params.activityBase
  for (const peak of params.activityPeaks) {
    total += peak.amp * Math.exp(-((hour - peak.hour) ** 2) / peak.width)
  }
  return total
}

type DayPath = {
  /** Log price at every step, `steps + 1` of them, first and last pinned. */
  price: Float64Array
  /** Volume traded during the step that ends at each index; `volume[0]` is zero. */
  volume: Float64Array
}

/**
 * One day's path on one grid, as a Brownian bridge between that day's open and
 * close.
 *
 * The walk is built first and the implied drift is subtracted afterwards, which
 * pins the end without ever looking at where the end was going.
 */
function buildDayPath(seed: number, day: number, state: MarketDay, params: MarketParams): DayPath {
  const steps = params.coarseSteps
  const stepSeconds = secondsPerDay / steps
  const stepVolatility = state.sigma / Math.sqrt(steps)
  // Jumps are counted per *step*, not per second. Scaling the other way gave every
  // single minute of the day a jump, which is not a market that trades but one
  // that teleports.
  const jumpChance = params.intradayJumpsPerDay / steps
  const price = new Float64Array(steps + 1)
  const volume = new Float64Array(steps + 1)
  const baseRate = params.baseDailyVolume / secondsPerDay
  // Activity is not the same thing as volatility. A day carries quiet stretches
  // and bursts inside it, and a burst is what makes a second of history worth
  // watching: without one every second is an identical step, and a chart of
  // seconds is a flat line pretending to be a market. The burst is held constant
  // across a block of steps and redrawn at the boundary, so a block lasts the same
  // stretch of time whichever grid the day is being walked on.
  const burstDecay = Math.exp(-params.burstBlockSeconds / params.burstHalfLife)
  const burstShock = params.burstSpread * Math.sqrt(1 - burstDecay * burstDecay)
  let walk = 0
  let farthest = 0
  let block = -1
  let burstLevel = 0
  let burst = 1

  for (let step = 1; step <= steps; step += 1) {
    const blockIndex = Math.floor((step * stepSeconds) / params.burstBlockSeconds)
    if (blockIndex !== block) {
      block = blockIndex
      burstLevel = burstDecay * burstLevel + burstShock * normal(seed, randomStreams.burst, day, blockIndex)
      burst = Math.exp(burstLevel)
    }
    const busy = activity(step * stepSeconds, params)
    const move = normal(seed, randomStreams.path, day, step)
    // One coin flip per step is the price of the fat tail, and it is the only
    // draw in this loop that is not needed every time.
    const jump =
      hashUnit(seed, randomStreams.jump, day, step) < jumpChance
        ? (hashUnit(seed, randomStreams.jump, day, step + 0x4000_0000) < 0.5 ? -1 : 1) *
          (params.intradayJumpLow +
            (params.intradayJumpHigh - params.intradayJumpLow) *
              hashUnit(seed, randomStreams.jump, day, step + 0x8000_0000))
        : 0
    walk += stepVolatility * busy * burst * move + jump
    price[step] = walk
    // How busy the session has been so far, measured against a *typical* day
    // rather than against this day's own volatility. Dividing by the day's own
    // sigma would score every day at about one, because a quiet day is quiet by
    // having a small sigma as well as a small move. Measured this way a day that
    // ranges far from where it opened trades noticeably more than one that drifts.
    if (Math.abs(walk) > farthest) farthest = Math.abs(walk)
    const traded = Math.min(farthest / params.dailyVolatility, 6)
    volume[step] =
      baseRate *
      stepSeconds *
      busy *
      burst *
      Math.exp(params.volumeWobble * normal(seed, randomStreams.volume, day, step)) *
      (1 + params.volumeMoveBoost * traded)
  }

  // Pin both ends. A Brownian bridge is a random walk with the linear ramp that
  // its own endpoint error implies removed, so the error is subtracted in full at
  // the end of the day and in proportion everywhere before it. Scaling it by the
  // step instead would leave the walk almost intact at the far end, and the day's
  // close would follow the intraday noise rather than the chain.
  const endpointError = walk
  for (let step = 0; step <= steps; step += 1) {
    const share = step / steps
    price[step] = state.open + share * (state.close - state.open) + (price[step] - share * endpointError)
  }
  return { price, volume }
}

/**
 * One minute of history resolved to individual samples, as a bridge between that
 * minute's own open and close on the day path.
 *
 * Pinning it to the minute is the point. The ticks are free to wander further than
 * the minute's first and last price did, which is what puts a shadow on a
 * one-second candle, but they cannot wander away from where the minute finished:
 * the last second of the minute closes at the minute's close, and the minutes'
 * traded volume is this path's traded volume, so the ladder from seconds to
 * minutes adds up instead of merely looking like it should.
 */
function buildTickPath(
  seed: number,
  day: number,
  minute: number,
  coarse: DayPath,
  state: MarketDay,
  params: MarketParams
): DayPath {
  const steps = 60 * params.tickRate
  const price = new Float64Array(steps + 1)
  const volume = new Float64Array(steps + 1)
  const open = coarse.price[minute]
  const close = coarse.price[minute + 1]
  // A tick is a fraction of a minute's worth of movement, so it is a fraction of
  // that minute's worth of noise as well.
  const stepVolatility = state.sigma / Math.sqrt(params.coarseSteps * steps)
  const base = minute * steps
  let walk = 0

  for (let step = 1; step <= steps; step += 1) {
    walk += stepVolatility * normal(seed, randomStreams.tick, day, base + step)
    price[step] = walk
  }

  const endpointError = walk
  for (let step = 0; step <= steps; step += 1) {
    const share = step / steps
    price[step] = open + share * (close - open) + (price[step] - share * endpointError)
  }

  // Trades arrive in clumps, so the weights are drawn rather than spread evenly,
  // and then scaled to the minute's own volume. One tick path is a few tens of
  // kilobytes, so the minutes a chart is showing are worth keeping.
  let weightSum = 0
  const weight = new Float64Array(steps + 1)
  for (let step = 1; step <= steps; step += 1) {
    weight[step] = Math.exp(params.volumeWobble * normal(seed, randomStreams.tickVolume, day, base + step))
    weightSum += weight[step]
  }
  const traded = coarse.volume[minute + 1]
  for (let step = 1; step <= steps; step += 1) {
    volume[step] = (weight[step] / weightSum) * traded
  }
  return { price, volume }
}

/**
 * A small cache of built day paths. A weekly candle needs seven days and a screen
 * of hourly candles needs as many days as it shows, so the same day is asked for
 * over and over.
 */
const pathCache = new Map<string, DayPath>()
const pathCacheLimit = 8

function dayPathFor(seed: number, day: number, state: MarketDay, params: MarketParams, key: string): DayPath {
  const cacheKey = `${key}:${day}`
  const cached = pathCache.get(cacheKey)
  if (cached) {
    // Re-insert so the map keeps insertion order and the oldest goes first.
    pathCache.delete(cacheKey)
    pathCache.set(cacheKey, cached)
    return cached
  }
  const built = buildDayPath(seed, day, state, params)
  if (pathCache.size >= pathCacheLimit) {
    const oldest = pathCache.keys().next()
    if (!oldest.done) pathCache.delete(oldest.value)
  }
  pathCache.set(cacheKey, built)
  return built
}

/**
 * Tick paths are small enough to keep in numbers a reader would recognise: a
 * screen of second candles is four minutes, a screen of thirty-second candles is
 * two hours, and neither should have to be drawn twice.
 */
const tickCache = new Map<string, DayPath>()
const tickCacheLimit = 320

function tickPathFor(
  seed: number,
  day: number,
  minute: number,
  coarse: DayPath,
  state: MarketDay,
  params: MarketParams,
  key: string
): DayPath {
  const cacheKey = `${key}:${day}:${minute}`
  const cached = tickCache.get(cacheKey)
  if (cached) {
    tickCache.delete(cacheKey)
    tickCache.set(cacheKey, cached)
    return cached
  }
  const built = buildTickPath(seed, day, minute, coarse, state, params)
  if (tickCache.size >= tickCacheLimit) {
    const oldest = tickCache.keys().next()
    if (!oldest.done) tickCache.delete(oldest.value)
  }
  tickCache.set(cacheKey, built)
  return built
}

const dayIndexAt = (timeMs: number): number => Math.floor((timeMs - marketEpoch) / msPerDay)

/** Minutes since the market opened, and the first moment of any minute. */
const minuteIndexAt = (timeMs: number): number => Math.floor((timeMs - marketEpoch) / msPerMinute)

const minuteStartMs = (minute: number): number => marketEpoch + minute * msPerMinute

const roundPrice = (value: number, decimals: number): number => {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

export type CandleRequest = {
  timeframe?: Timeframe
  /** How many bars, ending with the one that contains `until`. */
  count?: number
  /** Right edge in epoch milliseconds. Defaults to now. */
  until?: number
  seed?: string
  startPrice?: number
  /**
   * Knobs for a different market. Left out, the published market is generated, which
   * is the only thing the published page ever asks for.
   */
  params?: Partial<MarketParams>
  /**
   * Cuts the last bar off at the present moment, so a chart can show the bar that
   * is still forming rather than waiting for it to close. The market is decided in
   * advance, so a cut bar is a real part of the same day rather than a guess.
   */
  live?: boolean
}

/**
 * `count` bars of `timeframe`, oldest first, ending with the bar that contains
 * `until`.
 *
 * Fewer bars come back when the market has not been running long enough to fill
 * the window, rather than padding the front with invented history.
 */
export function generateCandles(request: CandleRequest = {}): Candle[] {
  const {
    timeframe = '1d',
    count = 200,
    until = Date.now(),
    seed = defaultSeed,
    startPrice = defaultStartPrice,
    params: overrides,
    live = false
  } = request
  if (!isTimeframe(timeframe)) throw new Error(`unknown timeframe: ${timeframe}`)
  const seconds = timeframeSeconds[timeframe]
  const seedNumber = hashSeed(seed)
  const params = resolveParams(overrides)
  // The knobs are part of the cache key, so a market that is not the published one
  // cannot be served a day the published page built, however unlikely that would be
  // to notice by eye.
  const key = `${seedNumber}:${startPrice}:${paramsKey(params)}`
  // Bars are numbered from the day the market opened, not from 1970, so asking for
  // more history than has happened is answered with less history.
  const lastIndex = Math.floor((until - marketEpoch) / (seconds * msPerSecond))
  const total = Math.min(Math.max(Math.trunc(count) || 0, 1), lastIndex + 1)
  if (total < 1) return []
  const firstIndex = lastIndex - total + 1
  // A bar can be longer than a day, so the chain has to reach the day holding its
  // *end*: a weekly candle walks into the six days after the week opened.
  const lastBarEnd = marketEpoch + (lastIndex + 1) * seconds * msPerSecond - 1
  const days = marketDays(seedNumber, startPrice, dayIndexAt(lastBarEnd), params)
  // A bar of a minute or less is drawn from the ticks inside its own minutes, which
  // is what gives it a shadow; a longer one is drawn from the minute grid. A minute
  // candle therefore knows more about its minute than an hourly candle does about
  // its hour, so a roll-up that crosses that line is contained by its parent rather
  // than equal to it. Resolving the closed minute candles the same way as the
  // forming one is not optional: a shadow that appeared while a bar was open and
  // vanished when it closed would be a candle lying about its own minute.
  const fine = seconds <= secondsPerMinute
  const candles: Candle[] = []
  const opened = Date.now()

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const startMs = marketEpoch + index * seconds * msPerSecond
    // Only the newest bar is ever still forming, and only while it has actually
    // started, so the cut is applied there and nowhere else. A bar dated in the
    // future is left whole rather than cut to nothing.
    const wholeBar = startMs + seconds * msPerSecond
    const barEnd =
      live && index === lastIndex && opened > startMs ? Math.min(wholeBar, opened) : wholeBar
    let open = 0
    let close = 0
    let high = -Infinity
    let low = Infinity
    let volume = 0
    let first = true
    let cursor = startMs

    // A bar is walked a day at a time and a minute within it, because a minute is
    // the finest slice the day path is cut into and every timeframe divides into
    // it. The sub-minute candles, and the piece of the newest bar that is still
    // being written, are resolved to ticks instead, so a one-second candle has a
    // body and a shadow and a daily candle keeps moving while its day is going.
    while (cursor < barEnd) {
      const day = dayIndexAt(cursor)
      const dayEnd = Math.min(marketEpoch + (day + 1) * msPerDay, barEnd)
      const coarse = dayPathFor(seedNumber, day, days[day], params, key)

      while (cursor < dayEnd) {
        const minuteStart = minuteStartMs(minuteIndexAt(cursor))
        const minuteEnd = Math.min(minuteStart + msPerMinute, dayEnd)
        const minuteOfDay = minuteIndexAt(cursor) - day * minutesPerDay
        // Only the last piece of the newest bar can be cut short, and only while
        // that bar is still open, so only that piece is resolved any finer.
        const cut = barEnd < wholeBar && minuteEnd >= barEnd

        if (fine) {
          // The bar's own resolution, so a shadow that is on the candle is one the
          // closed candle keeps: ticks all the way through, forming bar included.
          const ticks = tickPathFor(seedNumber, day, minuteOfDay, coarse, days[day], params, key)
          const from = Math.round(((cursor - minuteStart) / msPerSecond) * params.tickRate)
          const to = Math.round(((minuteEnd - minuteStart) / msPerSecond) * params.tickRate)
          for (let tick = from; tick <= to; tick += 1) {
            const price = Math.exp(ticks.price[tick])
            if (first) {
              open = price
              first = false
            }
            if (price > high) high = price
            if (price < low) low = price
            // As on the day path, `volume[i]` is what traded during the sample
            // ending at `i`, so a candle sums from the sample after its own first.
            if (tick > from) volume += ticks.volume[tick]
          }
          close = Math.exp(ticks.price[to])
        } else if (cut) {
          // The bar in hand. Its extremes are read from the minute grid exactly as
          // the closed bar will read them, because a shadow that appeared while the
          // candle was open and was gone once it closed would be the candle
          // misreporting its own hour. Its last price comes from the ticks, which
          // is what moves a daily candle twenty times a second instead of once a
          // minute, and the guard below folds that price into the range if it sits
          // outside the minutes seen so far.
          const boundary = Math.exp(coarse.price[minuteOfDay])
          if (first) {
            open = boundary
            first = false
          }
          if (boundary > high) high = boundary
          if (boundary < low) low = boundary
          const ticks = tickPathFor(seedNumber, day, minuteOfDay, coarse, days[day], params, key)
          const from = Math.round(((cursor - minuteStart) / msPerSecond) * params.tickRate)
          const to = Math.round(((minuteEnd - minuteStart) / msPerSecond) * params.tickRate)
          // The ticks carry the minute's own volume, so the part of the minute that
          // has happened is a share of it rather than a guess, and the total can
          // only ever grow towards what the closed bar will report.
          for (let tick = from + 1; tick <= to; tick += 1) volume += ticks.volume[tick]
          close = Math.exp(ticks.price[to])
        } else {
          // A whole piece is a whole minute of the day path, so it reads that
          // minute's two boundaries. A cut piece is short, and that one has gone
          // to the ticks above.
          for (let step = minuteOfDay; step <= minuteOfDay + 1; step += 1) {
            const price = Math.exp(coarse.price[step])
            if (first) {
              open = price
              first = false
            }
            if (price > high) high = price
            if (price < low) low = price
            if (step > minuteOfDay) volume += coarse.volume[step]
          }
          close = Math.exp(coarse.price[minuteOfDay + 1])
        }
        cursor = minuteEnd
      }
    }

    const openRounded = roundPrice(open, params.priceDecimals)
    const closeRounded = roundPrice(close, params.priceDecimals)
    candles.push({
      time: startMs,
      open: openRounded,
      // Rounding is monotonic, so this can only ever agree; the guard is what
      // makes the invariant a fact of the output rather than a hope.
      high: Math.max(roundPrice(high, params.priceDecimals), openRounded, closeRounded),
      low: Math.min(roundPrice(low, params.priceDecimals), openRounded, closeRounded),
      close: closeRounded,
      volume: Math.round(volume * 100) / 100
    })
  }
  return candles
}

/** The bar index a moment falls in, which is what a chart needs to place a cursor. */
export function candleIndexAt(timeMs: number, timeframe: Timeframe): number {
  return Math.floor((timeMs - marketEpoch) / (timeframeSeconds[timeframe] * msPerSecond))
}

export type RangeExtremes = { low: number; high: number; lowAt: number; highAt: number }

/**
 * The lowest and highest the market reached between two moments, on the minute
 * grid the day path is cut on.
 *
 * A candle asks for ticks, because a shadow that appeared and vanished inside a
 * minute is still a shadow the closed candle has to own. A replay does not: it
 * needs to know what a resting order and a liquidation price were reached by over
 * days, and it needs to know it now, on the main thread, before the page is
 * usable. Minute boundaries are what a five minute candle reports its own extremes
 * from, so an order this old is judged the same way a candle this old is drawn.
 */
export function minuteExtremesBetween(
  fromMs: number,
  toMs: number,
  seed: string = defaultSeed,
  startPrice: number = defaultStartPrice,
  overrides?: Partial<MarketParams>
): RangeExtremes {
  const from = Math.max(fromMs, marketEpoch)
  const to = Math.max(from, toMs)
  const seedNumber = hashSeed(seed)
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  let lowAt = from
  let highAt = from
  const firstMinute = Math.floor((from - marketEpoch) / msPerMinute)
  const lastMinute = Math.floor((to - marketEpoch) / msPerMinute)
  const params = resolveParams(overrides)
  const key = `${seedNumber}:${startPrice}:${paramsKey(params)}`
  const days = marketDays(seedNumber, startPrice, dayIndexAt(to), params)
  const firstDay = dayIndexAt(from)

  for (let day = firstDay; day <= dayIndexAt(to); day += 1) {
    const state = days[day]
    if (!state) break
    const path = dayPathFor(seedNumber, day, state, params, key)
    const first = day * minutesPerDay
    const last = Math.min(lastMinute, first + minutesPerDay)
    for (let minute = Math.max(firstMinute, first); minute <= last; minute += 1) {
      // Both ends of the minute: the path records a price at every boundary, so a
      // minute is judged by the two prices it joined, not by the one it kept.
      for (let step = 0; step <= 1; step += 1) {
        const price = Math.exp(path.price[minute - first + step])
        const at = minuteStartMs(minute) + step * msPerMinute
        if (at < from || at > to) continue
        if (price < low) {
          low = price
          lowAt = at
        }
        if (price > high) {
          high = price
          highAt = at
        }
      }
    }
  }

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    const first = days[firstDay] ?? days[0]
    const price = Math.exp(dayPathFor(seedNumber, firstDay, first, params, key).price[0])
    return { low: price, high: price, lowAt: from, highAt: from }
  }
  return { low, high, lowAt, highAt }
}

/** Forgets the built paths, so a new seed does not have to wait for the cache to turn over. */
export function resetMarketCache(): void {
  pathCache.clear()
  tickCache.clear()
}
