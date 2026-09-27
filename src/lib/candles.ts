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

/** Prices print to the cent, as a market quoted in dollars would. */
const priceDecimals = 2

const dailyVolatility = 0.45 / Math.sqrt(365)
/** Roughly a quarter a year, which trends up without running away. */
const driftPerDay = 0.00055
/** How fast a quiet spell turns into a wild one. */
const volatilityHalfLife = 3 * secondsPerDay
/** A calm stretch runs at about 0.6x the baseline volatility. */
const volatilitySpread = 0.45
/** About six jumps a year, which is the tail a normal distribution cannot make. */
const jumpChancePerDay = 1 / 60
const jumpLow = 0.02
const jumpHigh = 0.09
/** Flash moves inside a day, per day, on top of whatever the bridge does. */
const intradayJumpsPerDay = 2
const intradayJumpLow = 0.003
const intradayJumpHigh = 0.015
/** How long a busy spell inside a day lasts before it settles again. */
const burstHalfLife = 20 * 60
/** How often that spell is redrawn, in seconds. */
const burstBlockSeconds = 8 * 60
/** A quiet stretch inside a day runs at roughly a third of the busy one. */
const burstSpread = 0.8
/** Units of the asset traded in a quiet day. */
const baseDailyVolume = 18_000
/** How much a big move lifts its volume over an ordinary one. */
const volumeMoveBoost = 3.5
const volumeWobble = 0.28

/** How many samples a day is cut into. */
const coarseSteps = 1440
/**
 * How many samples a second of history is drawn at, and so how many a minute
 * holds. This is what gives a one-second candle a body and a shadow: a second is
 * not one sample but twenty of them, strung between that minute's own open and
 * close, which is also why the sub-minute candles and the minute candle agree
 * about where the minute ended.
 */
const tickRate = 20
const ticksPerMinute = 60 * tickRate

const volatilityDecay = Math.exp(-secondsPerDay / volatilityHalfLife)
const volatilityShock = volatilitySpread * Math.sqrt(1 - volatilityDecay * volatilityDecay)

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
function trendPerDay(seed: number, day: number): number {
  const periods = [9, 23, 61]
  let total = 0
  for (let index = 0; index < periods.length; index += 1) {
    const phase = 2 * Math.PI * hashUnit(seed, randomStreams.trend, index)
    total += Math.sin((2 * Math.PI * day) / periods[index] + phase) / (index + 1.4)
  }
  return total * 0.004
}

/** One uniform draw at a coordinate, for the places that need a phase or a coin flip. */
function hashUnit(seed: number, stream: number, a: number, b = 0): number {
  return uniform(seed, stream, a, b)
}

function jumpFor(seed: number, day: number): number {
  if (hashUnit(seed, randomStreams.jump, day) >= jumpChancePerDay) return 0
  const size = jumpLow + (jumpHigh - jumpLow) * hashUnit(seed, randomStreams.jump, day, 1)
  return (hashUnit(seed, randomStreams.jump, day, 2) < 0.5 ? -1 : 1) * size
}

/**
 * The chain of days, oldest first, from the epoch to `last`.
 *
 * Every day draws a fixed number of values, so the state on any given day is the
 * same no matter how far back the caller asked to start — the price on a
 * Tuesday cannot depend on which week someone wanted to look at.
 */
function marketDays(seed: number, startPrice: number, last: number): MarketDay[] {
  const days: MarketDay[] = []
  let logPrice = Math.log(startPrice)
  let logVolatility = 0
  for (let day = 0; day <= last; day += 1) {
    logVolatility = volatilityDecay * logVolatility + volatilityShock * normal(seed, randomStreams.volatility, day, 0)
    const sigma = dailyVolatility * Math.exp(logVolatility)
    const open = logPrice
    const close = open + driftPerDay + trendPerDay(seed, day) + sigma * normal(seed, randomStreams.price, day, 0) + jumpFor(seed, day)
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
function activity(secondOfDay: number): number {
  const hour = secondOfDay / 3600
  return (
    0.72 +
    0.5 * Math.exp(-((hour - 14) ** 2) / 9) +
    0.42 * Math.exp(-((hour - 8) ** 2) / 6) +
    0.34 * Math.exp(-((hour - 0) ** 2) / 5) +
    0.3 * Math.exp(-((hour - 21) ** 2) / 6)
  )
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
function buildDayPath(seed: number, day: number, state: MarketDay): DayPath {
  const steps = coarseSteps
  const stepSeconds = secondsPerDay / steps
  const stepVolatility = state.sigma / Math.sqrt(steps)
  // Jumps are counted per *step*, not per second. Scaling the other way gave every
  // single minute of the day a jump, which is not a market that trades but one
  // that teleports.
  const jumpChance = intradayJumpsPerDay / steps
  const price = new Float64Array(steps + 1)
  const volume = new Float64Array(steps + 1)
  const baseRate = baseDailyVolume / secondsPerDay
  // Activity is not the same thing as volatility. A day carries quiet stretches
  // and bursts inside it, and a burst is what makes a second of history worth
  // watching: without one every second is an identical step, and a chart of
  // seconds is a flat line pretending to be a market. The burst is held constant
  // across a block of steps and redrawn at the boundary, so a block lasts the same
  // stretch of time whichever grid the day is being walked on.
  const burstDecay = Math.exp(-burstBlockSeconds / burstHalfLife)
  const burstShock = burstSpread * Math.sqrt(1 - burstDecay * burstDecay)
  let walk = 0
  let farthest = 0
  let block = -1
  let burstLevel = 0
  let burst = 1

  for (let step = 1; step <= steps; step += 1) {
    const blockIndex = Math.floor((step * stepSeconds) / burstBlockSeconds)
    if (blockIndex !== block) {
      block = blockIndex
      burstLevel = burstDecay * burstLevel + burstShock * normal(seed, randomStreams.burst, day, blockIndex)
      burst = Math.exp(burstLevel)
    }
    const busy = activity(step * stepSeconds)
    const move = normal(seed, randomStreams.path, day, step)
    // One coin flip per step is the price of the fat tail, and it is the only
    // draw in this loop that is not needed every time.
    const jump =
      hashUnit(seed, randomStreams.jump, day, step) < jumpChance
        ? (hashUnit(seed, randomStreams.jump, day, step + 0x4000_0000) < 0.5 ? -1 : 1) *
          (intradayJumpLow +
            (intradayJumpHigh - intradayJumpLow) * hashUnit(seed, randomStreams.jump, day, step + 0x8000_0000))
        : 0
    walk += stepVolatility * busy * burst * move + jump
    price[step] = walk
    // How busy the session has been so far, measured against a *typical* day
    // rather than against this day's own volatility. Dividing by the day's own
    // sigma would score every day at about one, because a quiet day is quiet by
    // having a small sigma as well as a small move. Measured this way a day that
    // ranges far from where it opened trades noticeably more than one that drifts.
    if (Math.abs(walk) > farthest) farthest = Math.abs(walk)
    const traded = Math.min(farthest / dailyVolatility, 6)
    volume[step] =
      baseRate *
      stepSeconds *
      busy *
      burst *
      Math.exp(volumeWobble * normal(seed, randomStreams.volume, day, step)) *
      (1 + volumeMoveBoost * traded)
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
function buildTickPath(seed: number, day: number, minute: number, coarse: DayPath, state: MarketDay): DayPath {
  const steps = ticksPerMinute
  const price = new Float64Array(steps + 1)
  const volume = new Float64Array(steps + 1)
  const open = coarse.price[minute]
  const close = coarse.price[minute + 1]
  // A tick is a fraction of a minute's worth of movement, so it is a fraction of
  // that minute's worth of noise as well.
  const stepVolatility = state.sigma / Math.sqrt(coarseSteps * steps)
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
    weight[step] = Math.exp(volumeWobble * normal(seed, randomStreams.tickVolume, day, base + step))
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

function dayPathFor(seed: number, day: number, state: MarketDay): DayPath {
  const key = `${seed}:${day}`
  const cached = pathCache.get(key)
  if (cached) {
    // Re-insert so the map keeps insertion order and the oldest goes first.
    pathCache.delete(key)
    pathCache.set(key, cached)
    return cached
  }
  const built = buildDayPath(seed, day, state)
  if (pathCache.size >= pathCacheLimit) {
    const oldest = pathCache.keys().next()
    if (!oldest.done) pathCache.delete(oldest.value)
  }
  pathCache.set(key, built)
  return built
}

/**
 * Tick paths are small enough to keep in numbers a reader would recognise: a
 * screen of second candles is four minutes, a screen of thirty-second candles is
 * two hours, and neither should have to be drawn twice.
 */
const tickCache = new Map<string, DayPath>()
const tickCacheLimit = 320

function tickPathFor(seed: number, day: number, minute: number, coarse: DayPath, state: MarketDay): DayPath {
  const key = `${seed}:${day}:${minute}`
  const cached = tickCache.get(key)
  if (cached) {
    tickCache.delete(key)
    tickCache.set(key, cached)
    return cached
  }
  const built = buildTickPath(seed, day, minute, coarse, state)
  if (tickCache.size >= tickCacheLimit) {
    const oldest = tickCache.keys().next()
    if (!oldest.done) tickCache.delete(oldest.value)
  }
  tickCache.set(key, built)
  return built
}

const dayIndexAt = (timeMs: number): number => Math.floor((timeMs - marketEpoch) / msPerDay)

/** Minutes since the market opened, and the first moment of any minute. */
const minuteIndexAt = (timeMs: number): number => Math.floor((timeMs - marketEpoch) / msPerMinute)

const minuteStartMs = (minute: number): number => marketEpoch + minute * msPerMinute

const roundPrice = (value: number): number => {
  const scale = 10 ** priceDecimals
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
    live = false
  } = request
  if (!isTimeframe(timeframe)) throw new Error(`unknown timeframe: ${timeframe}`)
  const seconds = timeframeSeconds[timeframe]
  const seedNumber = hashSeed(seed)
  // Bars are numbered from the day the market opened, not from 1970, so asking for
  // more history than has happened is answered with less history.
  const lastIndex = Math.floor((until - marketEpoch) / (seconds * msPerSecond))
  const total = Math.min(Math.max(Math.trunc(count) || 0, 1), lastIndex + 1)
  if (total < 1) return []
  const firstIndex = lastIndex - total + 1
  // A bar can be longer than a day, so the chain has to reach the day holding its
  // *end*: a weekly candle walks into the six days after the week opened.
  const lastBarEnd = marketEpoch + (lastIndex + 1) * seconds * msPerSecond - 1
  const days = marketDays(seedNumber, startPrice, dayIndexAt(lastBarEnd))
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
      const coarse = dayPathFor(seedNumber, day, days[day])

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
          const ticks = tickPathFor(seedNumber, day, minuteOfDay, coarse, days[day])
          const from = Math.round(((cursor - minuteStart) / msPerSecond) * tickRate)
          const to = Math.round(((minuteEnd - minuteStart) / msPerSecond) * tickRate)
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
          const ticks = tickPathFor(seedNumber, day, minuteOfDay, coarse, days[day])
          const from = Math.round(((cursor - minuteStart) / msPerSecond) * tickRate)
          const to = Math.round(((minuteEnd - minuteStart) / msPerSecond) * tickRate)
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

    const openRounded = roundPrice(open)
    const closeRounded = roundPrice(close)
    candles.push({
      time: startMs,
      open: openRounded,
      // Rounding is monotonic, so this can only ever agree; the guard is what
      // makes the invariant a fact of the output rather than a hope.
      high: Math.max(roundPrice(high), openRounded, closeRounded),
      low: Math.min(roundPrice(low), openRounded, closeRounded),
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
  startPrice: number = defaultStartPrice
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
  const days = marketDays(seedNumber, startPrice, dayIndexAt(to))
  const firstDay = dayIndexAt(from)

  for (let day = firstDay; day <= dayIndexAt(to); day += 1) {
    const state = days[day]
    if (!state) break
    const path = dayPathFor(seedNumber, day, state)
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
    const price = Math.exp(dayPathFor(seedNumber, firstDay, first).price[0])
    return { low: price, high: price, lowAt: from, highAt: from }
  }
  return { low, high, lowAt, highAt }
}

/** Forgets the built paths, so a new seed does not have to wait for the cache to turn over. */
export function resetMarketCache(): void {
  pathCache.clear()
  tickCache.clear()
}
