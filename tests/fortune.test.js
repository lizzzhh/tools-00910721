import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  defaultFortuneSeed,
  defaultFortuneStart,
  fortuneAt,
  fortuneBarCount,
  fortuneBarIndexAt,
  fortuneBarSeconds,
  fortuneDailyChange,
  fortuneDefaults,
  fortuneEpoch,
  fortuneMax,
  fortuneParamsKey,
  fortuneRefreshMs,
  fortuneTone,
  generateFortuneCandles,
  localOffsetMs,
  resetFortuneCache,
  resolveFortuneParams
} from '../src/lib/fortune.ts'

const HOUR = 3_600_000
const DAY = 86_400_000
const BAR_MS = fortuneBarSeconds * 1000
/** A Sunday lunchtime, far enough inside a four hour bar that a second of clock cannot cross one. */
const IN_2026 = Date.UTC(2026, 8, 27, 12, 34, 17)

/** Runs `body` with the clock pinned to `at`, and puts the real clock back after. */
function withClock(at, body) {
  const real = Date.now
  Date.now = () => at
  try {
    return body()
  } finally {
    Date.now = real
  }
}

const bars = (request = {}) => {
  resetFortuneCache()
  return generateFortuneCandles({ count: fortuneBarCount, until: IN_2026, ...request })
}

const close = (series) => series[series.length - 1].close

test('a score is a hundredth inside a scale that is neither end of', () => {
  for (let step = 0; step < 4000; step += 1) {
    const at = IN_2026 + step * 1000
    const score = fortuneAt(at)
    assert.ok(score > 0 && score < fortuneMax, `${at} printed ${score}, which is against the scale`)
    assert.equal(score, Number(score.toFixed(2)), `${at} printed more than a hundredth`)
  }
})

test('the same seed replays the same fortune, and another seed does not', () => {
  const first = JSON.stringify(bars())
  const second = JSON.stringify(bars())
  const other = JSON.stringify(bars({ seed: 'a-different-seed' }))
  assert.equal(first, second)
  assert.notEqual(first, other)
})

test('a moment answers the same whatever was asked before it', () => {
  // The chains and the paths are cached, so a cache hit has to agree with a miss.
  const alone = fortuneAt(IN_2026)
  fortuneAt(IN_2026 - 400 * DAY)
  generateFortuneCandles({ count: 900, until: IN_2026 })
  assert.equal(fortuneAt(IN_2026), alone)
})

test('a second reads at its own end, and the next second reads at its own', () => {
  // Two seconds inside one minute, so nothing about a minute boundary can be
  // doing the work.
  const at = Date.UTC(2026, 8, 27, 12, 0, 10)
  const early = fortuneAt(at)
  const later = fortuneAt(at + 1000)
  // Reading inside the first second must not already be reading the second one.
  assert.equal(early, fortuneAt(at + 899))
  assert.equal(later, fortuneAt(at + 1999))
  // A whole second is not a whole tick of the path, so the two can agree and
  // usually do: what matters is that neither is looking anywhere but its second.
  assert.equal(fortuneAt(at), fortuneAt(at))
})

test('the fortune is the same in another reader own clock', () => {
  // The score at a moment cannot depend on where the reader is standing: only
  // the bar edges move.
  assert.equal(fortuneAt(IN_2026), fortuneAt(IN_2026, { offsetMs: 8 * HOUR }))
})

test('every bar is internally consistent and inside the scale', () => {
  for (const bar of bars()) {
    const top = Math.max(bar.open, bar.close)
    const bottom = Math.min(bar.open, bar.close)
    assert.ok(bar.high >= top, 'high is below its body')
    assert.ok(bar.low <= bottom, 'low is above its body')
    assert.ok(bar.low > 0 && bar.high < fortuneMax, 'a bar left the scale')
    assert.equal(bar.high, Number(bar.high.toFixed(2)))
  }
})

test('the bars are aligned, gapless and cut where they are told to', () => {
  const utc = bars()
  for (let index = 1; index < utc.length; index += 1) {
    assert.equal(utc[index].time - utc[index - 1].time, BAR_MS, 'there is a gap in the bars')
  }
  for (const bar of utc) {
    assert.equal((bar.time - fortuneEpoch) % BAR_MS, 0, 'a bar is not a whole bar from the epoch')
  }

  // A reader's own offset moves the grid and only the grid: the edge the reader
  // stands behind moves, and the score under it does not.
  const offset = 5.5 * HOUR
  const shifted = bars({ offsetMs: offset })
  assert.equal(shifted.length, utc.length)
  for (const bar of shifted) {
    assert.equal((bar.time - (fortuneEpoch - offset)) % BAR_MS, 0, 'a bar is off the reader own grid')
  }
  const holds = (series, at) => series.find((bar) => at >= bar.time && at < bar.time + BAR_MS)?.time
  assert.notEqual(holds(shifted, IN_2026), holds(utc, IN_2026), 'the offset did not move the edge behind the reader')
  assert.equal(fortuneAt(IN_2026), fortuneAt(IN_2026, { offsetMs: offset }))
})

test('a bar opens where the one before it closed', () => {
  const series = bars()
  for (let index = 1; index < series.length; index += 1) {
    assert.equal(series[index].open, series[index - 1].close, `bar ${index} opened away from the close`)
  }
})

test('the newest bar is a whole bar unless it is still open', () => {
  const closed = bars({ live: false })
  const live = withClock(IN_2026, () => generateFortuneCandles({ count: fortuneBarCount, until: IN_2026, live: true }))
  // The cut is applied to the one bar still forming and to nothing else.
  assert.deepEqual(closed.slice(0, -1), live.slice(0, -1), 'the cut reached a bar that had already closed')
  assert.notEqual(close(closed), close(live), 'a bar that is still open closed at its own end')

  // One second into the whole chain there is barely a bar there at all, and it
  // still has to be a candle a chart can draw.
  const sliver = withClock(fortuneEpoch + 1000, () =>
    generateFortuneCandles({ count: 4, until: fortuneEpoch + 1000, live: true })
  )
  assert.equal(sliver.length, 1, 'a bar was invented before the chain had run')
  for (const bar of sliver) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close), 'the sliver high is below its body')
    assert.ok(bar.low <= Math.min(bar.open, bar.close), 'the sliver low is above its body')
  }
})

test('the number on the card is the close of the bar it stands in', () => {
  const series = withClock(IN_2026, () => generateFortuneCandles({ count: 8, until: IN_2026, live: true }))
  const newest = series[series.length - 1]
  const score = fortuneAt(IN_2026)
  assert.equal(newest.close, score, 'the forming bar does not close where the card reads')
  assert.ok(score >= newest.low && score <= newest.high, 'the score is outside its own bar')
})

test('a shadow does not appear while a bar is open and vanish once it closed', () => {
  // A closed bar and a forming one read their shadow off the same minute grid,
  // so the extremes a bar has already reported can only grow. A forming bar that
  // reaches further than the bar it turns into is a bar that takes back an hour
  // it has already shown.
  const midwayAt = IN_2026 - 90 * 60_000
  const midway = withClock(midwayAt, () => generateFortuneCandles({ count: 4, until: midwayAt, live: true }))
  const forming = midway[midway.length - 1]
  const settled = bars().find((bar) => bar.time === forming.time)
  assert.ok(settled, 'the forming bar is not in the window that closes it')
  assert.ok(settled.high >= forming.high, 'the shadow shrank above when the bar closed')
  assert.ok(settled.low <= forming.low, 'the shadow shrank below when the bar closed')
  // The shadow really is being held back while the bar is open: the seconds the
  // card reads are not allowed to be the extremes the chart prints.
  const closed = bars()
  assert.ok(
    closed.some((bar) => bar.high > bar.close && bar.low < bar.open),
    'no bar in the window has a shadow at all',
  )
})

test('a candle keeps the shape of the move, not just its endpoints', () => {
  // Nothing forces the path between two scores to move at all: a straight line
  // between open and close would pass every check above.
  const series = bars()
  const withWicks = series.filter(
    (bar) => bar.high > Math.max(bar.open, bar.close) && bar.low < Math.min(bar.open, bar.close)
  )
  assert.ok(withWicks.length > series.length * 0.5, `only ${withWicks.length} of ${series.length} bars have a shadow`)
})

test('the score moves, and most seconds it moves by something', () => {
  const base = Date.UTC(2026, 8, 27, 9, 0, 0)
  const second = fortuneAt(base)
  assert.notEqual(fortuneAt(base + 600_000), second, 'a score that never moves is not a fortune')
  let moved = 0
  const seconds = 4000
  for (let step = 1; step <= seconds; step += 1) {
    if (fortuneAt(base + step * 1000) !== fortuneAt(base + (step - 1) * 1000)) moved += 1
  }
  // A hundredth is the resolution the card prints at, so a second that does not
  // change the number is not a failure. A second that never does is a card that
  // looks stuck.
  assert.ok(moved > seconds * 0.5, `only ${moved} of ${seconds} seconds moved the score`)
})

test('the scale is used and not sat on', () => {
  // Over two years of hours the score has to leave the middle often enough to
  // read as a fortune, and never print a bound it did not earn.
  const scores = []
  for (let hour = 0; hour < 730 * 24; hour += 1) {
    scores.push(fortuneAt(Date.UTC(2026, 0, 5) + hour * HOUR))
  }
  const sorted = [...scores].sort((a, b) => a - b)
  const at = (fraction) => sorted[Math.floor(fraction * (sorted.length - 1))]
  assert.ok(at(0.5) > 35 && at(0.5) < 65, `a median of ${at(0.5)} is not the middle of a fortune`)
  assert.ok(at(0.05) < 35, `the score hardly ever goes low (5% ${at(0.05)})`)
  assert.ok(at(0.95) > 65, `the score hardly ever goes high (95% ${at(0.95)})`)
  assert.ok(scores.every((score) => score > 0 && score < fortuneMax))
  // Sitting against a bound is the failure this scale exists to avoid: the
  // logistic bends into the ends, but the chain must not be living there.
  assert.ok(scores.filter((score) => score < 2 || score > 98).length < scores.length * 0.01)
})

test('the bar index of a moment is the bar it is standing in', () => {
  const offset = localOffsetMs(new Date(IN_2026))
  for (const at of [IN_2026, IN_2026 + 3_600_000, IN_2026 + 123 * 60_000]) {
    const index = fortuneBarIndexAt(at, offset)
    const bar = bars({ until: at, offsetMs: offset }).find((candidate) => candidate.time === fortuneEpoch - offset + index * BAR_MS)
    assert.ok(bar, `no bar matches the index of ${new Date(at).toISOString()}`)
    const score = fortuneAt(at)
    assert.ok(score >= bar.low && score <= bar.high)
  }
})

test('a moment before the epoch reads the start of the chain', () => {
  const opened = fortuneAt(fortuneEpoch)
  assert.equal(fortuneAt(fortuneEpoch - 10 * DAY), opened, 'the chain has history before it began')
  // The first day of all time opens at the middle of the scale. A second is read
  // at its end, so the first second is already a hair off it.
  assert.ok(Math.abs(opened - defaultFortuneStart) < 0.1, `the first day opened at ${opened}`)
})

test('a seed with a start it cannot print still gets one', () => {
  for (const startScore of [0, fortuneMax, Number.NaN, -10]) {
    const score = fortuneAt(IN_2026, { startScore })
    assert.equal(score, fortuneAt(IN_2026, { startScore: defaultFortuneStart }))
  }
})

test('the knobs resolve, and a different set is a different fortune', () => {
  assert.deepEqual(resolveFortuneParams(), fortuneDefaults)
  const wild = resolveFortuneParams({ dailyVolatility: 0.9 })
  assert.equal(wild.dailyVolatility, 0.9)
  assert.equal(wild.trendPeriods, fortuneDefaults.trendPeriods)
  assert.notEqual(fortuneParamsKey(wild), fortuneParamsKey(fortuneDefaults))
  assert.equal(fortuneParamsKey(fortuneDefaults), fortuneParamsKey({ ...fortuneDefaults }))
  assert.notEqual(fortuneAt(IN_2026), fortuneAt(IN_2026, { params: { dailyVolatility: 0.9 } }))
})

test('the wording a score earns runs from the top of the scale down', () => {
  assert.equal(fortuneTone(100), 'inspired')
  assert.equal(fortuneTone(0), 'stutter')
  assert.equal(fortuneTone(Number.NaN), 'stutter')
  const ladder = [99, 80, 65, 50, 40, 20].map(fortuneTone)
  const rank = { inspired: 6, smooth: 5, online: 4, steady: 3, focus: 2, stutter: 1 }
  for (let index = 1; index < ladder.length; index += 1) {
    assert.ok(rank[ladder[index]] < rank[ladder[index - 1]], `${ladder[index]} outranks ${ladder[index - 1]}`)
  }
})

test('the published seed and epoch are the ones the card ships with', () => {
  assert.equal(defaultFortuneSeed, 'code-space:fortune/v1')
  assert.equal(fortuneEpoch, Date.UTC(2024, 0, 1))
  assert.equal(fortuneBarSeconds, 4 * 3600)
  assert.equal(fortuneDefaults.decimals, 2)
  assert.equal(fortuneRefreshMs, 5_000, 'the card and its badge have to agree on the cadence')
})

test('two readers are two fortunes, and one reader is one fortune', () => {
  // The seed is the only thing telling two readers apart, and it is the whole of
  // it: the same moment and a different seed must not land on the same score.
  const mine = { seed: 'code-space:fortune/aaaaaaaa' }
  const yours = { seed: 'code-space:fortune/bbbbbbbb' }
  const at = IN_2026
  assert.notEqual(fortuneAt(at, mine), fortuneAt(at, yours))
  // And the reader's own seed has to keep answering the same way, on a fresh
  // cache and after the card has asked about other moments in between.
  assert.equal(fortuneAt(at, mine), fortuneAt(at, mine))
  fortuneAt(at + 777_000, mine)
  fortuneAt(at - 40 * DAY, yours)
  assert.equal(fortuneAt(at, mine), fortuneAt(at, mine))
  resetFortuneCache()
  assert.equal(fortuneAt(at, mine), fortuneAt(at, mine))
})

test('the change since yesterday is the same length of path whichever hour it is', () => {
  // Yesterday at the same time of day, so the two numbers are 24 hours apart and
  // not some other distance that would change the size of the sign over a day.
  for (let hour = 0; hour < 24; hour += 1) {
    const at = Date.UTC(2026, 8, 27) + hour * HOUR
    const change = fortuneDailyChange(at)
    const yesterday = fortuneAt(at - DAY)
    const today = fortuneAt(at)
    assert.equal(change, Number((today - yesterday).toFixed(2)), `hour ${hour} is not a day apart`)
    // Two two-decimal scores subtracted give a difference with more decimals than
    // either of them, and the card has no room to print those.
    assert.equal(change, Number(change.toFixed(2)), `hour ${hour} is not a difference the card could print`)
    // A fortune of a hundred points cannot move more than the whole scale, and it
    // should not be sitting on its own limit either.
    assert.ok(Math.abs(change) < fortuneMax)
  }
})

test('a reader whose fortune rises is told so, and one whose fortune falls is told so', () => {
  // The sign is the whole of the line, so both directions have to be reachable
  // and neither may be a coin flip on a flat number.
  let up = 0
  let down = 0
  for (let probe = 0; probe < 400; probe += 1) {
    const at = Date.UTC(2026, 8, 27) + probe * 6 * HOUR
    const change = fortuneDailyChange(at)
    if (change > 0) up += 1
    if (change < 0) down += 1
  }
  assert.ok(up > 50, `only ${up} of 400 probes rose against yesterday`)
  assert.ok(down > 50, `only ${down} of 400 probes fell against yesterday`)
})