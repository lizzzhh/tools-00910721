import { hashSeed, normal, uniform } from './random.ts'

/**
 * A daily fortune that moves, generated from a fixed seed the way the paper
 * market is generated in `candles.ts`.
 *
 * The rule that shapes this file is the same one that shapes the market: the
 * score at any instant is a pure function of `(seed, day, second)`. Nothing is
 * carried from one call to the next, and no second is ever reached by walking
 * forward from the start of the chain. That is what lets the dashboard ask for
 * one moment, ask again a minute later, and ask a reader in another time zone
 * for the same four hour bars — all of them get the same answer, and a reload
 * shows the same fortune.
 *
 * A seed and the clock are the whole input, which is also what makes the
 * fortune personal: the card mints a seed per reader and keeps it
 * (`fortune-seed.ts`), and two readers then run the same model over the same
 * seconds and land on different numbers. Nothing here has to know which it is.
 *
 * It is also what keeps the timeframes honest. The score shown on the card and
 * the close of the bar it sits inside are two views of one path, so the bar
 * cannot disagree with the number on it.
 *
 * The model, in the order the code applies it:
 *
 * - The score lives in `(0, 100)` because it is read through a logistic, not
 *   because it is clamped. A clamp would print 0.00 and 100.00 and sit there;
 *   the logistic bends into them instead, which is the only reason a score can
 *   come close to its bounds without ever reporting one it did not earn.
 * - The day's level reverts. A price is free to walk forever, but a fortune
 *   that random walks to 0.01 by November and back by March is not a fortune,
 *   it is a broken scale, so the level is pulled toward the middle of the
 *   score with a half life of weeks.
 * - Volatility is mean-reverting in log level, which is what produces the calm
 *   days and the wild ones that a plain random walk never has.
 * - A slow trend rides on top of the drift, so a week of days goes somewhere
 *   instead of only wandering.
 * - Large one-sided jumps are added on top, because a day that matters is not a
 *   normal tail event.
 * - Inside a day the path is a Brownian bridge pinned to that day's open and
 *   close, which is the honest way to draw a path whose two ends are already
 *   fixed.
 * - Inside a minute it is pinned the same way again, and that is the path the
 *   card reads every second. A four hour bar is therefore made of minutes, and
 *   the number ticking on it is made of the seconds inside its own minute.
 *
 * The grid is anchored to the epoch rather than to the reader's clock, so the
 * value at a moment never depends on where the reader is standing. Only the bar
 * *boundaries* are shifted, by the offset the reader is given, which is what
 * puts a bar edge on their own midnight instead of on UTC's.
 */

/** Stream ids, which are the market's own numbers reused against a different seed. */
const streams = {
  volatility: 0x1f3d,
  level: 0x2b7f,
  trend: 0x35a1,
  jump: 0x4c11,
  path: 0x51ed,
  burst: 0x7a17,
  tick: 0x3d4f
} as const

const secondsPerMinute = 60
const secondsPerDay = 86_400
const msPerSecond = 1000
const msPerMinute = 60 * msPerSecond
const msPerDay = secondsPerDay * msPerSecond
const minutesPerDay = 1440

/**
 * Where the chain of days begins. A fixed date rather than `Date.now()`,
 * because a fortune whose past moves with the reader is not the same fortune
 * twice, and the seed would stop meaning anything.
 */
export const fortuneEpoch = Date.UTC(2024, 0, 1)

/**
 * The seed used when no reader's own seed is available: an older browser with no
 * secure random, or a caller that wants the published fortune. The card mints
 * and stores one of its own instead, so this is the fallback and not the norm.
 */
export const defaultFortuneSeed = 'code-space:fortune/v1'

/** The top of the scale. The bottom is zero, and neither is ever printed. */
export const fortuneMax = 100

/** A score prints to the hundredth, so it can be seen to move. */
export const fortuneDecimals = 2

/** What the first day of all time opens at, which is the middle of the scale. */
export const defaultFortuneStart = 50

/** How many seconds one bar of the card holds. */
export const fortuneBarSeconds = 4 * 3600

/** How many bars the card draws, which is four days of them. */
export const fortuneBarCount = 24

/**
 * How often the card reads the model again.
 *
 * The model itself can answer for any second it is asked about, but a number
 * that moves every second is a number nobody can read, and one that moves all
 * the time is one that draws the eye away from everything else on the page. Once
 * every five seconds is quick enough that the day still feels like it is passing,
 * and slow enough that a change of direction is worth colouring.
 */
export const fortuneRefreshMs = 5_000

/**
 * The model's knobs, collected as data.
 *
 * They are a value rather than a set of constants so a caller can generate a
 * different fortune and get a different answer out of it. The published card
 * passes nothing and runs on {@link fortuneDefaults}, which is what keeps a
 * change here from moving the fortune anybody is reading.
 */
export type FortuneParams = {
  /** How many decimals a score prints at. */
  decimals: number
  /** How far the level is pulled back toward the middle of the scale, in days. */
  reversionHalfLife: number
  /** How far a typical day moves the level, in log level. */
  dailyVolatility: number
  /** Which way the level leans over a long run. */
  driftPerDay: number
  /** How fast a quiet spell turns into a wild one, in seconds. */
  volatilityHalfLife: number
  /** A calm stretch runs at about 0.6x the baseline volatility. */
  volatilitySpread: number
  /** About nine sharp days a year, which is the tail a normal draw cannot make. */
  jumpChancePerDay: number
  /** Smallest day jump, in log level. */
  jumpLow: number
  /** Largest day jump, in log level. */
  jumpHigh: number
  /** Flash moves inside a day, per day, on top of whatever the bridge does. */
  intradayJumpsPerDay: number
  /** Smallest flash move. */
  intradayJumpLow: number
  /** Largest flash move. */
  intradayJumpHigh: number
  /** How long a wild stretch inside a day lasts before it settles, in seconds. */
  burstHalfLife: number
  /** How often that stretch is redrawn, in seconds. */
  burstBlockSeconds: number
  /** A quiet stretch inside a day runs at roughly half the busy one. */
  burstSpread: number
  /** The three horizons of the slow trend, in days, shortest first. */
  trendPeriods: number[]
  /** How much the trend moves a day at its widest, in log level. */
  trendAmp: number
  /** How much each horizon counts for less than the one before it. */
  trendDecay: number
  /**
   * How many samples a second of a minute is drawn at, and so how finely the
   * ticking number can move inside one. The card reads the last sample of the
   * current second, so this is also what a one second step is allowed to see.
   */
  tickRate: number
}

/**
 * The published values, chosen so a score spends most of its life between about
 * 20 and 80, swings five or six points a day, moves a hundredth most seconds,
 * and never leaves a flat line against either end of the scale.
 */
export const fortuneDefaults: FortuneParams = {
  decimals: fortuneDecimals,
  reversionHalfLife: 9,
  dailyVolatility: 0.38,
  driftPerDay: 0.0012,
  volatilityHalfLife: 2 * secondsPerDay,
  volatilitySpread: 0.22,
  jumpChancePerDay: 1 / 90,
  jumpLow: 0.05,
  jumpHigh: 0.2,
  intradayJumpsPerDay: 4,
  intradayJumpLow: 0.012,
  intradayJumpHigh: 0.05,
  burstHalfLife: 20 * 60,
  burstBlockSeconds: 8 * 60,
  burstSpread: 0.8,
  trendPeriods: [7, 23, 61],
  trendAmp: 0.012,
  trendDecay: 1.3,
  tickRate: 20
}

/**
 * A finished set of knobs, with anything the caller left out taken from the
 * published fortune. Unknown keys are dropped and the arrays are copied, so a
 * caller cannot reach in and edit a chain that is already under way.
 */
export function resolveFortuneParams(overrides?: Partial<FortuneParams>): FortuneParams {
  if (!overrides) return fortuneDefaults
  const merged = { ...fortuneDefaults }
  for (const key of Object.keys(fortuneDefaults) as (keyof FortuneParams)[]) {
    const value = overrides[key]
    if (value === undefined) continue
    if (Array.isArray(fortuneDefaults[key])) {
      if (Array.isArray(value)) (merged as Record<string, unknown>)[key] = [...(value as unknown[])]
    } else if (typeof value === typeof fortuneDefaults[key]) {
      ;(merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}

/**
 * What a finished set of knobs is worth, as a short string.
 *
 * It is part of the cache key, so two differently tuned fortunes cannot be
 * served each other's days and a tuned run does not have to wait for the cache
 * to turn over.
 */
export function fortuneParamsKey(params: FortuneParams): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number') parts.push(`${key}=${value.toFixed(6)}`)
    else parts.push(`${key}=${JSON.stringify(value)}`)
  }
  return parts.join(',')
}

/** The score a level prints at. Bent into the range rather than clipped to it. */
function scoreOf(level: number): number {
  return fortuneMax / (1 + Math.exp(-level))
}

/** The level a score is read from, and so the only inverse of {@link scoreOf}. */
function levelOf(score: number): number {
  return Math.log(score / (fortuneMax - score))
}

function roundScore(value: number, decimals: number): number {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

/** One day of the chain: the level it opened and closed at, and how loud it was. */
type FortuneDay = {
  open: number
  close: number
  /** Daily volatility, in log level, and the unit every other figure uses. */
  sigma: number
  /** The volatility state itself, kept so the chain can be resumed. */
  logVolatility: number
}

/**
 * A slow trend at three horizons, so a run of days has swings worth waiting for
 * rather than only noise around a line. The phases come from the seed, which is
 * what makes one fortune's good week land somewhere else than another's.
 */
function trendPerDay(seedNumber: number, day: number, params: FortuneParams): number {
  let total = 0
  for (let index = 0; index < params.trendPeriods.length; index += 1) {
    const phase = 2 * Math.PI * uniform(seedNumber, streams.trend, index, 0)
    total += Math.sin((2 * Math.PI * day) / params.trendPeriods[index] + phase) / (index + params.trendDecay)
  }
  return total * params.trendAmp
}

function jumpFor(seedNumber: number, day: number, params: FortuneParams): number {
  if (uniform(seedNumber, streams.jump, day, 0) >= params.jumpChancePerDay) return 0
  const size = params.jumpLow + (params.jumpHigh - params.jumpLow) * uniform(seedNumber, streams.jump, day, 1)
  return (uniform(seedNumber, streams.jump, day, 2) < 0.5 ? -1 : 1) * size
}

/**
 * The chain of days from the epoch to `last`, oldest first.
 *
 * Every day draws a fixed number of values, so the state on any given day is the
 * same however far back the caller asked to start — today's level cannot depend
 * on which week someone wanted to look at. The chain grows by a day at a time
 * and is kept, because the card asks for it once a second and walking two years
 * of days sixty times a minute would be the only expensive thing on the page.
 */
const dayCache = new Map<string, FortuneDay[]>()
const dayCacheLimit = 8

function fortuneDays(
  key: string,
  seedNumber: number,
  startLevel: number,
  last: number,
  params: FortuneParams
): FortuneDay[] {
  let days = dayCache.get(key)
  if (!days) {
    if (dayCache.size >= dayCacheLimit) dayCache.clear()
    days = []
    dayCache.set(key, days)
  }
  if (days.length > last) return days
  const reversion = Math.exp(-1 / params.reversionHalfLife)
  const decay = Math.exp(-secondsPerDay / params.volatilityHalfLife)
  const shock = params.volatilitySpread * Math.sqrt(1 - decay * decay)
  let level = days.length === 0 ? startLevel : days[days.length - 1].close
  let logVolatility = days.length === 0 ? 0 : days[days.length - 1].logVolatility

  for (let day = days.length; day <= last; day += 1) {
    logVolatility = decay * logVolatility + shock * normal(seedNumber, streams.volatility, day, 0)
    const sigma = params.dailyVolatility * Math.exp(logVolatility)
    const open = level
    const close =
      open * reversion +
      params.driftPerDay +
      trendPerDay(seedNumber, day, params) +
      sigma * normal(seedNumber, streams.level, day, 0) +
      jumpFor(seedNumber, day, params)
    days.push({ open, close, sigma, logVolatility })
    level = close
  }
  return days
}

/**
 * One day's path on the minute grid, as a Brownian bridge between that day's
 * open and close.
 *
 * The walk is built first and the implied drift is subtracted afterwards, which
 * pins the end without ever looking at where the end was going.
 */
function buildDayPath(seedNumber: number, day: number, state: FortuneDay, params: FortuneParams): Float64Array {
  const steps = minutesPerDay
  const stepVolatility = state.sigma / Math.sqrt(steps)
  // Jumps are counted per *minute*, not per second. Scaling the other way gave
  // every second of the day a jump, which is not a fortune that moves but one
  // that teleports.
  const jumpChance = params.intradayJumpsPerDay / steps
  const path = new Float64Array(steps + 1)
  // A day carries quiet stretches and wild ones inside it, and the wild one is
  // what gives a four hour bar a body worth looking at: without one every minute
  // of the day is an identical step. The level is held across a block of minutes
  // and redrawn at the boundary, so a block lasts the same stretch of time
  // whichever day is being walked.
  const burstDecay = Math.exp(-params.burstBlockSeconds / params.burstHalfLife)
  const burstShock = params.burstSpread * Math.sqrt(1 - burstDecay * burstDecay)
  let walk = 0
  let block = -1
  let burstLevel = 0
  let burst = 1

  for (let step = 1; step <= steps; step += 1) {
    const blockIndex = Math.floor((step * secondsPerMinute) / params.burstBlockSeconds)
    if (blockIndex !== block) {
      block = blockIndex
      burstLevel = burstDecay * burstLevel + burstShock * normal(seedNumber, streams.burst, day, blockIndex)
      burst = Math.exp(burstLevel)
    }
    const move = normal(seedNumber, streams.path, day, step)
    // One coin flip per minute is the price of the fat tail, and it is the only
    // draw in this loop that is not needed every time.
    const jump =
      uniform(seedNumber, streams.jump, day, step) < jumpChance
        ? (uniform(seedNumber, streams.jump, day, step + 0x4000_0000) < 0.5 ? -1 : 1) *
          (params.intradayJumpLow +
            (params.intradayJumpHigh - params.intradayJumpLow) *
              uniform(seedNumber, streams.jump, day, step + 0x8000_0000))
        : 0
    walk += stepVolatility * burst * move + jump
    path[step] = walk
  }

  // Pin both ends. A Brownian bridge is a random walk with the linear ramp that
  // its own endpoint error implies removed, so the error is subtracted in full at
  // the end of the day and in proportion everywhere before it.
  const endpointError = walk
  for (let step = 0; step <= steps; step += 1) {
    const share = step / steps
    path[step] = state.open + share * (state.close - state.open) + (path[step] - share * endpointError)
  }
  return path
}

/**
 * One minute of history resolved to individual seconds, as a bridge between that
 * minute's own open and close on the day path.
 *
 * Pinning it to the minute is the point. The seconds are free to wander further
 * than the minute's first and last score did, which is what puts a shadow on a
 * bar, but they cannot wander away from where the minute finished: the last
 * second of a minute closes at the minute's close.
 */
function buildTickPath(
  seedNumber: number,
  day: number,
  minute: number,
  coarse: Float64Array,
  state: FortuneDay,
  params: FortuneParams
): Float64Array {
  const steps = 60 * params.tickRate
  const path = new Float64Array(steps + 1)
  // A second is a fraction of a minute's worth of movement, so it is a fraction
  // of that minute's worth of noise as well.
  const stepVolatility = state.sigma / Math.sqrt(minutesPerDay * steps)
  const base = minute * steps
  let walk = 0

  for (let step = 1; step <= steps; step += 1) {
    walk += stepVolatility * normal(seedNumber, streams.tick, day, base + step)
    path[step] = walk
  }

  const endpointError = walk
  const open = coarse[minute]
  const close = coarse[minute + 1]
  for (let step = 0; step <= steps; step += 1) {
    const share = step / steps
    path[step] = open + share * (close - open) + (path[step] - share * endpointError)
  }
  return path
}

const dayIndexAt = (timeMs: number): number => Math.floor((timeMs - fortuneEpoch) / msPerDay)
const minuteIndexAt = (timeMs: number): number => Math.floor((timeMs - fortuneEpoch) / msPerMinute)
const minuteStartMs = (minute: number): number => fortuneEpoch + minute * msPerMinute

/** A four hour bar. ECharts reads a candle as `[open, close, low, high]`. */
export type FortuneCandle = {
  /** The UTC millisecond the bar opens at. */
  time: number
  open: number
  high: number
  low: number
  close: number
}

/** The small caches of built paths, kept beside the keys they are built for. */
const dayPathCache = new Map<string, Float64Array>()
const dayPathLimit = 8
const tickPathCache = new Map<string, Float64Array>()
const tickPathLimit = 320

function dayPathFor(key: string, seedNumber: number, day: number, state: FortuneDay, params: FortuneParams) {
  const cacheKey = `${key}:${day}`
  const cached = dayPathCache.get(cacheKey)
  if (cached) {
    // Re-insert so the map keeps insertion order and the oldest goes first.
    dayPathCache.delete(cacheKey)
    dayPathCache.set(cacheKey, cached)
    return cached
  }
  const built = buildDayPath(seedNumber, day, state, params)
  if (dayPathCache.size >= dayPathLimit) {
    const oldest = dayPathCache.keys().next()
    if (!oldest.done) dayPathCache.delete(oldest.value)
  }
  dayPathCache.set(cacheKey, built)
  return built
}

function tickPathFor(
  key: string,
  seedNumber: number,
  day: number,
  minute: number,
  coarse: Float64Array,
  state: FortuneDay,
  params: FortuneParams
) {
  const cacheKey = `${key}:${day}:${minute}`
  const cached = tickPathCache.get(cacheKey)
  if (cached) {
    tickPathCache.delete(cacheKey)
    tickPathCache.set(cacheKey, cached)
    return cached
  }
  const built = buildTickPath(seedNumber, day, minute, coarse, state, params)
  if (tickPathCache.size >= tickPathLimit) {
    const oldest = tickPathCache.keys().next()
    if (!oldest.done) tickPathCache.delete(oldest.value)
  }
  tickPathCache.set(cacheKey, built)
  return built
}

export type FortuneRequest = {
  /** How many bars, ending with the one that contains `until`. */
  count?: number
  /** Right edge in epoch milliseconds. Defaults to now. */
  until?: number
  /**
   * Where the bar grid is anchored, in milliseconds east of UTC. The default is
   * UTC itself, which is what the tests and the node side ask for; a reader
   * passes their own offset so a bar edge falls on their midnight.
   */
  offsetMs?: number
  seed?: string
  /** What the first day of all time opens at. */
  startScore?: number
  params?: Partial<FortuneParams>
  /**
   * Cuts the newest bar off at the present moment, so the card can show the bar
   * that is still forming. The fortune is settled in advance, so a cut bar is a
   * real part of the same day rather than a guess.
   */
  live?: boolean
}

type FortuneContext = {
  seedNumber: number
  startLevel: number
  params: FortuneParams
  key: string
}

function contextAt(request: FortuneRequest): FortuneContext {
  const seed = request.seed ?? defaultFortuneSeed
  const params = resolveFortuneParams(request.params)
  const start = request.startScore ?? defaultFortuneStart
  // The start is a score, and a score has to sit strictly inside the scale for
  // the logistic to have a level for it. A caller who asks for an impossible
  // start gets the published one rather than an infinity.
  const startScore = Number.isFinite(start) && start > 0 && start < fortuneMax ? start : defaultFortuneStart
  const seedNumber = hashSeed(seed)
  return { seedNumber, startLevel: levelOf(startScore), params, key: `${seedNumber}:${startScore}:${fortuneParamsKey(params)}` }
}

/**
 * The score at a moment, to the hundredth.
 *
 * This is the number the card ticks, and it is the close of the bar that moment
 * falls in, which is what keeps the two from ever telling the reader different
 * stories.
 */
export function fortuneAt(timeMs: number, request: FortuneRequest = {}): number {
  const { seedNumber, startLevel, params, key } = contextAt(request)
  const at = Math.max(timeMs, fortuneEpoch)
  const day = dayIndexAt(at)
  const days = fortuneDays(key, seedNumber, startLevel, day, params)
  const coarse = dayPathFor(key, seedNumber, day, days[day], params)
  const minute = minuteIndexAt(at) - day * minutesPerDay
  const secondOfMinute = Math.floor((at - minuteStartMs(minuteIndexAt(at))) / msPerSecond)
  const ticks = tickPathFor(key, seedNumber, day, minute, coarse, days[day], params)
  // A second is read at its end, so a second that has not finished yet reports
  // where it is rather than where it was a second ago.
  const index = Math.min((secondOfMinute + 1) * params.tickRate, 60 * params.tickRate)
  return roundScore(scoreOf(ticks[index]), params.decimals)
}

/**
 * How far a moment sits from the same moment a day before it.
 *
 * Yesterday at the same time of day rather than the end of yesterday, so the
 * two numbers are the same length of path apart rather than a different number
 * of hours, and the sign on the card means the same thing at breakfast and at
 * midnight.
 *
 * Rounded to the resolution the card prints, because two two-decimal scores
 * subtracted give a difference with more decimals than either of them, and
 * `63.14 - 67.00` is not `-3.8599999999999994`.
 */
export function fortuneDailyChange(timeMs: number, request: FortuneRequest = {}): number {
  const params = resolveFortuneParams(request.params)
  const change = fortuneAt(timeMs, { ...request, params }) - fortuneAt(timeMs - msPerDay, { ...request, params })
  return roundScore(change, params.decimals)
}

/**
 * `count` four hour bars, oldest first, ending with the bar that contains
 * `until`.
 *
 * Fewer bars come back when the chain has not been running long enough to fill
 * the window, rather than padding the front with invented history.
 */
export function generateFortuneCandles(request: FortuneRequest = {}): FortuneCandle[] {
  const { count = fortuneBarCount, until = Date.now(), offsetMs = 0, live = false } = request
  const { seedNumber, startLevel, params, key } = contextAt(request)
  const barMs = fortuneBarSeconds * msPerSecond
  const gridStart = fortuneEpoch - offsetMs
  const opened = Date.now()
  const lastIndex = Math.floor((until - gridStart) / barMs)
  const total = Math.min(Math.max(Math.trunc(count) || 0, 1), lastIndex + 1)
  if (total < 1) return []
  const firstIndex = lastIndex - total + 1
  // A bar can cross midnight, so the chain has to reach the day holding its
  // *end*.
  const lastBarEnd = gridStart + (lastIndex + 1) * barMs - 1
  const days = fortuneDays(key, seedNumber, startLevel, dayIndexAt(lastBarEnd), params)
  const candles: FortuneCandle[] = []

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const startMs = gridStart + index * barMs
    // Only the newest bar is ever still forming, and only while it has actually
    // started, so the cut is applied there and nowhere else. A bar dated in the
    // future is left whole rather than cut to nothing.
    const wholeBar = startMs + barMs
    const barEnd =
      live && index === lastIndex && opened > startMs ? Math.min(wholeBar, opened) : wholeBar
    let open = 0
    let close = 0
    let high = Number.NEGATIVE_INFINITY
    let low = Number.POSITIVE_INFINITY
    let first = true
    let cursor = startMs

    // A bar is walked a day at a time and a minute within it, because a minute is
    // the finest slice the day path is cut into and a four hour bar divides into
    // it. The piece of the newest bar that is still being written is resolved to
    // seconds instead, which is what lets the card move it once a second without
    // the shadow it draws appearing and then vanishing when the bar closes.
    while (cursor < barEnd) {
      const day = dayIndexAt(cursor)
      const dayEnd = Math.min(fortuneEpoch + (day + 1) * msPerDay, barEnd)
      const coarse = dayPathFor(key, seedNumber, day, days[day], params)

      while (cursor < dayEnd) {
        const minuteStart = minuteStartMs(minuteIndexAt(cursor))
        const minuteEnd = Math.min(minuteStart + msPerMinute, dayEnd)
        const minuteOfDay = minuteIndexAt(cursor) - day * minutesPerDay
        // Only the last piece of the newest bar can be cut short, and only while
        // that bar is still open, so only that piece is resolved any finer.
        const cut = barEnd < wholeBar && minuteEnd >= barEnd

        if (cut) {
          // The extremes are read from the minute grid exactly as the closed bar
          // will read them, because a shadow that appeared while the bar was open
          // and was gone once it closed would be the bar misreporting its own
          // hour. Its last score comes from the seconds.
          const boundary = scoreOf(coarse[minuteOfDay])
          if (first) {
            open = boundary
            first = false
          }
          if (boundary > high) high = boundary
          if (boundary < low) low = boundary
          const ticks = tickPathFor(key, seedNumber, day, minuteOfDay, coarse, days[day], params)
          // The piece is read at the end of the second it stops in, which is the
          // second the card is showing, so the newest bar cannot disagree with
          // the number on it.
          const second = Math.floor((barEnd - minuteStart) / msPerSecond)
          const to = Math.min((second + 1) * params.tickRate, 60 * params.tickRate)
          close = scoreOf(ticks[to])
        } else {
          // A whole piece is a whole minute of the day path, so it reads that
          // minute's two boundaries. A cut piece is short, and that one went to
          // the seconds above.
          for (let step = minuteOfDay; step <= minuteOfDay + 1; step += 1) {
            const score = scoreOf(coarse[step])
            if (first) {
              open = score
              first = false
            }
            if (score > high) high = score
            if (score < low) low = score
          }
          close = scoreOf(coarse[minuteOfDay + 1])
        }
        cursor = minuteEnd
      }
    }

    const openRounded = roundScore(open, params.decimals)
    const closeRounded = roundScore(close, params.decimals)
    candles.push({
      time: startMs,
      open: openRounded,
      // Rounding is monotonic, so this can only ever agree; the guard is what
      // makes the invariant a fact of the output rather than a hope.
      high: Math.max(roundScore(high, params.decimals), openRounded, closeRounded),
      low: Math.min(roundScore(low, params.decimals), openRounded, closeRounded),
      close: closeRounded
    })
  }
  return candles
}

/** The bar index a moment falls in, which is what the chart places a cursor at. */
export function fortuneBarIndexAt(timeMs: number, offsetMs = 0): number {
  return Math.floor((timeMs - (fortuneEpoch - offsetMs)) / (fortuneBarSeconds * msPerSecond))
}

/** The reader's own offset east of UTC, so the bars are cut at their midnight. */
export function localOffsetMs(now: Date = new Date()): number {
  return -now.getTimezoneOffset() * msPerMinute
}

/** Forgets the built chains and paths, so a new seed does not wait for a turnover. */
export function resetFortuneCache(): void {
  dayCache.clear()
  dayPathCache.clear()
  tickPathCache.clear()
}

/**
 * The wording a score earns, from the top of the scale down.
 *
 * The bounds are the middle of the score rather than its top, because a reader
 * looking at 63 wants to be told what 63 means and not handed a compliment that
 * a different reader could be getting at the same moment.
 */
const tones = [
  { floor: 85, tone: 'inspired' },
  { floor: 72, tone: 'smooth' },
  { floor: 58, tone: 'online' },
  { floor: 45, tone: 'steady' },
  { floor: 32, tone: 'focus' }
] as const

export type FortuneTone = (typeof tones)[number]['tone'] | 'stutter'

/** Which wording a score earns. Anything below the last bound is the worst of them. */
export function fortuneTone(score: number): FortuneTone {
  const value = Number.isFinite(score) ? score : 0
  for (const entry of tones) if (value >= entry.floor) return entry.tone
  return 'stutter'
}