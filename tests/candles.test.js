import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  candleIndexAt,
  defaultStartPrice,
  generateCandles,
  marketDefaults,
  marketEpoch,
  minuteExtremesBetween,
  paramsKey,
  resetMarketCache,
  resolveParams,
  timeframeSeconds,
} from '../src/lib/candles.ts'
import { changedCount, labFields, labPresets, overridesFrom, presetFields } from '../src/lib/market-lab.ts'
import {
  advanceClicks,
  doubleClickWindowMs,
  doubleClicks,
  newSequence,
  takeRun
} from '../src/lib/click-sequence.ts'

const DAY_MS = 86_400_000
const IN_2026 = Date.UTC(2026, 8, 26, 23, 59, 59)
/**
 * A Sunday lunchtime, far enough inside a minute, a quarter hour, an hour, a day
 * and a week that stepping the clock forward a second cannot cross a bar
 * boundary. Tests that move the clock need that, or they pass or fail depending on
 * when they were run.
 */
const TICK_AT = Date.UTC(2026, 8, 27, 12, 34, 17)

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

const bars = (timeframe, count, until = IN_2026, seed) => {
  resetMarketCache()
  return generateCandles({ timeframe, count, until, seed })
}

const close = (series) => series[series.length - 1].close

function aggregate(series) {
  return {
    open: series[0].open,
    close: close(series),
    high: Math.max(...series.map((bar) => bar.high)),
    low: Math.min(...series.map((bar) => bar.low)),
    volume: series.reduce((sum, bar) => sum + bar.volume, 0),
  }
}

test('the same seed replays the same market, and another seed does not', () => {
  const first = JSON.stringify(bars('1d', 120))
  const second = JSON.stringify(bars('1d', 120))
  const other = JSON.stringify(bars('1d', 120, IN_2026, 'a-different-seed'))
  assert.equal(first, second)
  assert.notEqual(first, other)
})

test('a replay is unaffected by anything generated before it', () => {
  // The day paths are cached, so a cache hit has to agree with a cache miss.
  const cached = JSON.stringify(generateCandles({ timeframe: '1d', count: 60, until: IN_2026 }))
  generateCandles({ timeframe: '1d', count: 900, until: IN_2026 })
  const afterCacheFill = JSON.stringify(generateCandles({ timeframe: '1d', count: 60, until: IN_2026 }))
  assert.equal(cached, afterCacheFill)
})

test('every timeframe produces a sorted, gapless, aligned run of bars', () => {
  for (const [timeframe, seconds] of Object.entries(timeframeSeconds)) {
    const series = bars(timeframe, 200)
    const step = seconds * 1000
    // The market has only been running since its epoch, so a request for more
    // weeks than have happened is answered with the weeks that have.
    const available = Math.floor((IN_2026 - marketEpoch) / (seconds * 1000)) + 1
    assert.equal(series.length, Math.min(200, available), `${timeframe} returned ${series.length} bars`)
    for (let index = 0; index < series.length; index += 1) {
      const bar = series[index]
      // Every bar sits a whole number of steps from the moment the market opened,
      // which is how a 1s bar and a 1w bar can both be aligned.
      assert.equal(
        (bar.time - marketEpoch) % step,
        0,
        `${timeframe} bar ${index} is not aligned with the open of the market`,
      )
      if (timeframe === '1w') {
        assert.equal(new Date(bar.time).getUTCDay(), 1, 'a week does not open on a Monday')
      }
      if (seconds < 86_400) {
        assert.equal(bar.time % (seconds * 1000), 0, `${timeframe} is not on a whole UTC second`)
      }
      if (index > 0) assert.equal(bar.time - series[index - 1].time, step, `${timeframe} has a gap`)
    }
  }
})

test('a bar is internally consistent and strictly positive', () => {
  for (const timeframe of ['1s', '30s', '1m', '1h', '1d', '1w']) {
    for (const bar of bars(timeframe, 500)) {
      const top = Math.max(bar.open, bar.close)
      const bottom = Math.min(bar.open, bar.close)
      assert.ok(bar.high >= top, `${timeframe} high is below its body`)
      assert.ok(bar.low <= bottom, `${timeframe} low is above its body`)
      assert.ok(bar.low > 0, `${timeframe} price is not positive`)
      assert.ok(bar.volume > 0, `${timeframe} traded nothing`)
      assert.ok(bar.high >= bar.low, `${timeframe} high is below its low`)
    }
  }
})

test('the day opens where the day before closed', () => {
  for (const timeframe of ['1s', '1m', '1h', '1d', '1w']) {
    const series = bars(timeframe, 400)
    for (let index = 1; index < series.length; index += 1) {
      // Rounded to two decimals, which is the resolution of a price.
      assert.equal(
        series[index].open,
        series[index - 1].close,
        `${timeframe} bar ${index} opened away from the previous close`,
      )
    }
  }
})

test('a candle keeps the shape of the move, not just its endpoints', () => {
  // Nothing forces the path between two prices to look like a market: a
  // straight line between open and close would pass every check above.
  const intraday = bars('1h', 720)
  const withWicks = intraday.filter(
    (bar) => bar.high > Math.max(bar.open, bar.close) && bar.low < Math.min(bar.open, bar.close),
  )
  assert.ok(withWicks.length > intraday.length * 0.5, 'most candles have no wick at all')

  const up = intraday.filter((bar) => bar.close > bar.open)
  const down = intraday.filter((bar) => bar.close < bar.open)
  assert.ok(up.length > 0 && down.length > 0, 'the market only moves one way')
  assert.ok(down.length > intraday.length * 0.2, 'the market never dips')
})

test('a day reads the same as its own hourly candles', () => {
  const day = bars('1d', 1)[0]
  for (const [timeframe, count] of [['1h', 24], ['15m', 96], ['30m', 48], ['5m', 288], ['4h', 6]]) {
    const rolledUp = aggregate(bars(timeframe, count))
    assert.equal(rolledUp.open, day.open, `${count} ${timeframe} opened elsewhere`)
    assert.equal(rolledUp.close, day.close, `${count} ${timeframe} closed elsewhere`)
    assert.equal(rolledUp.high, day.high, `${count} ${timeframe} never reached the high`)
    assert.equal(rolledUp.low, day.low, `${count} ${timeframe} never reached the low`)
    // Every bar rounds its volume to the cent, so a roll-up can only be equal to
    // within that rounding, once per bar.
    const tolerance = 0.005 * (count + 1)
    assert.ok(
      Math.abs(rolledUp.volume - day.volume) < tolerance,
      `${count} ${timeframe} traded ${rolledUp.volume} against ${day.volume}`,
    )
  }
})

test('an hour reads the same as its own minute candles', () => {
  const hour = bars('1h', 1)[0]
  const rolledUp = aggregate(bars('1m', 60))
  assert.equal(rolledUp.open, hour.open)
  assert.equal(rolledUp.close, hour.close)
  // The hour is read from the minute grid and the minutes from the ticks, so the
  // minutes know the hour's extremes only to the minute: the sixty candles are
  // inside their hour, never outside it and never short of it by more than a tick.
  assert.ok(rolledUp.high >= hour.high, 'a minute reached higher than the hour holding it')
  assert.ok(rolledUp.low <= hour.low, 'a minute reached lower than the hour holding it')
  assert.ok(rolledUp.high - hour.high < (hour.high - hour.low) * 0.2, 'the hour missed most of its minutes')
  assert.ok(Math.abs(rolledUp.volume - hour.volume) < 0.005 * 61)
})

test('a market is always open, weekends included', () => {
  const week = bars('1d', 40)
  const days = week.map((bar) => new Date(bar.time).getUTCDay())
  assert.ok(days.includes(0), 'no Sunday in six weeks')
  assert.ok(days.includes(6), 'no Saturday in six weeks')
  // 24x7 means no flat periods standing in for a closed exchange.
  const flat = week.filter((bar) => bar.high === bar.low)
  assert.equal(flat.length, 0, 'a day traded at one price')
})

test('a week starts where the week before ended', () => {
  const weeks = bars('1w', 30)
  for (let index = 1; index < weeks.length; index += 1) {
    assert.equal(weeks[index].open, weeks[index - 1].close)
  }
  // A week is seven daily candles, not a scaled-up day.
  const week = weeks[weeks.length - 1]
  assert.ok(week.high - week.low > 0, 'a week has no range')
})

test('bars are indexed the way the calendar says they should be', () => {
  for (const [timeframe, seconds] of Object.entries(timeframeSeconds)) {
    const series = bars(timeframe, 30)
    for (const [offset, bar] of series.entries()) {
      const index = candleIndexAt(bar.time, timeframe)
      const age = series.length - 1 - offset
      assert.equal(index, candleIndexAt(IN_2026, timeframe) - age, `${timeframe} index is off`)
    }
    assert.equal(
      candleIndexAt(series[series.length - 1].time + seconds * 1000, timeframe),
      candleIndexAt(series[series.length - 1].time, timeframe) + 1,
    )
  }
})

test('the market starts at the epoch and stops at what was asked for', () => {
  const opening = generateCandles({ timeframe: '1d', count: 3, until: marketEpoch })
  assert.equal(opening.length, 1, 'it invented history before the market existed')
  assert.equal(opening[0].time, marketEpoch)
  assert.equal(opening[0].open, defaultStartPrice, 'the market did not open at its first price')

  const recent = bars('1d', 5)
  const last = recent[recent.length - 1]
  assert.ok(last.time <= IN_2026, 'a bar is dated in the future')
  assert.ok(IN_2026 - last.time < DAY_MS, 'the last bar is not the current one')
  assert.equal(recent.length, 5)
})

test('a date reads the same however big a window it is asked for in', () => {
  const sixty = bars('1d', 60, IN_2026)
  const lastThirty = bars('1d', 30, IN_2026)
  const firstThirty = bars('1d', 30, IN_2026 - 30 * DAY_MS)
  // Paging back a month at a time has to land on the same bars as one long
  // request, otherwise scrolling a chart would rewrite history as you go.
  assert.deepEqual(lastThirty, sixty.slice(30))
  assert.deepEqual(firstThirty, sixty.slice(0, 30))
})

test('the market is lively enough to look like a market', () => {
  const daily = bars('1d', 900)
  const returns = daily.slice(1).map((bar, index) => Math.log(bar.close / daily[index].close))
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const sd = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length)
  // 0.45 annualised before clustering and jumps, so the realised figure should
  // land near 3% a day. A generator that drifted smoothly would sit near zero.
  assert.ok(sd > 0.015 && sd < 0.06, `daily movement of ${sd} is not a market`)
  assert.ok(Math.abs(mean) < 0.01, 'the whole market is one long trend')
  const range = daily.map((bar) => (bar.high - bar.low) / bar.close)
  const body = daily.map((bar) => Math.abs(bar.close - bar.open) / bar.close)
  const totalRange = range.reduce((sum, value) => sum + value, 0)
  const totalBody = body.reduce((sum, value) => sum + value, 0)
  // Real candles are mostly wick. A straight line between open and close gives 1.
  assert.ok(totalRange / totalBody > 1.4, 'candles are mostly body, so no intraday path')
  assert.ok(Math.max(...returns.map(Math.abs)) < 0.35, 'a single day moved the world')
})

test('volume follows the trading, and the quiet hours are quiet', () => {
  const intraday = bars('15m', 96)
  const byHour = new Map()
  for (const bar of intraday) {
    const hour = new Date(bar.time).getUTCHours()
    const record = byHour.get(hour) ?? { volume: 0, bars: 0 }
    byHour.set(hour, { volume: record.volume + bar.volume, bars: record.bars + 1 })
  }
  const busiest = Math.max(...[...byHour.values()].map((record) => record.volume / record.bars))
  const quietest = Math.min(...[...byHour.values()].map((record) => record.volume / record.bars))
  assert.ok(busiest / quietest > 1.5, 'every hour of the day is identical')

  const calm = bars('1d', 600)
  const volume = calm.map((bar) => bar.volume)
  const correlation = (xs, ys) => {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    const cov = xs.reduce((sum, x, index) => sum + (x - mx) * (ys[index] - my), 0)
    const sx = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0))
    const sy = Math.sqrt(ys.reduce((sum, y) => sum + (y - my) ** 2, 0))
    return cov / (sx * sy)
  }
  // Volume follows how far the market ranged, which is what a trader watches for.
  const spread = calm.map((bar) => (bar.high - bar.low) / bar.close)
  const scored = spread.map((value, index) => [value, volume[index]])
  // Comparing two averages of noisy groups is a weak test; asking whether the
  // busier days traded more across the whole sample is the claim being made.
  assert.ok(
    correlation(scored.map(([change]) => change), scored.map(([, traded]) => traded)) > 0.12,
    'volume does not follow the trading',
  )
})

test('prices stay in a plausible band instead of running away', () => {
  const long = bars('1d', 2000)
  const prices = long.flatMap((bar) => [bar.high, bar.low])
  const highest = Math.max(...prices)
  const lowest = Math.min(...prices)
  assert.ok(highest / lowest < 200, 'the market is a rocket or a ruin')
  assert.ok(lowest > 0.01, 'a price collapsed to nothing')
})

test('a second of history is drawn from twenty samples, not two', () => {
  // A second is twenty ticks strung between that minute's own open and close, so a
  // one-second candle has a body *and* a shadow. Sampled once a second it could
  // only ever be a line between two prices, which is what every sub-minute chart
  // used to look like.
  const seconds = bars('1s', 120)
  const withWicks = seconds.filter(
    (bar) => bar.high > Math.max(bar.open, bar.close) || bar.low < Math.min(bar.open, bar.close),
  )
  assert.ok(withWicks.length > seconds.length * 0.5, 'a one-second candle is still a line')
  const moved = seconds.filter((bar) => bar.close !== bar.open)
  assert.ok(moved.length > seconds.length * 0.5, 'a one-second candle never moves')
  const prices = seconds.map((bar) => bar.close)
  assert.ok(Math.max(...prices) > Math.min(...prices), 'two minutes without a price change')
  assert.equal(seconds[0].time % 1000, 0)
})

test('sixty one-second candles are the minute they belong to', () => {
  // The ticks are pinned to their own minute, so the ladder from seconds to
  // minutes is arithmetic rather than resemblance: the minute opens where its
  // first second opened, closes where its last second closed, and traded what the
  // minute traded. Only the shadow is wider, because the minute is read from the
  // minute grid and knows only its two boundaries.
  const minute = bars('1m', 1)[0]
  const seconds = aggregate(bars('1s', 60))
  assert.equal(seconds.open, minute.open)
  assert.equal(seconds.close, minute.close)
  assert.ok(Math.abs(seconds.volume - minute.volume) < 0.005 * 61)
  assert.ok(seconds.high >= minute.high, 'the seconds reached lower than their own minute')
  assert.ok(seconds.low <= minute.low, 'the seconds reached higher than their own minute')
})

test('the bar in hand counts every second, whatever the timeframe', () => {
  // A chart ticks once a second, and the newest candle has to answer to it. The
  // forming piece of a bar is tallied a second at a time, so a daily candle moves
  // every second instead of sitting still for a day.
  withClock(TICK_AT, () => {
    for (const timeframe of ['5s', '15s', '1m', '1h', '1d', '1w']) {
      const before = generateCandles({ timeframe, count: 1, live: true }).at(-1)
      const after = withClock(TICK_AT + 1000, () =>
        generateCandles({ timeframe, count: 1, live: true }).at(-1)
      )
      assert.equal(after.time, before.time, `${timeframe} jumped to another bar in one second`)
      assert.ok(after.volume > before.volume, `${timeframe} ignored a second of trading`)
      assert.equal(after.open, before.open, `${timeframe} opened somewhere else`)
    }
  })
})

test('a one second chart brings a new bar every second', () => {
  withClock(TICK_AT, () => {
    const first = generateCandles({ timeframe: '1s', count: 3, live: true })
    const second = withClock(TICK_AT + 1000, () => generateCandles({ timeframe: '1s', count: 3, live: true }))
    assert.equal(second.length, 3)
    assert.equal(second[2].time - first[2].time, 1000, 'the newest second did not advance')
    // The window slid by one, so the bar that was newest is now in the middle and
    // the oldest has left. Neither of the two that remain may be a different bar.
    assert.deepEqual(second.slice(0, 2), first.slice(1), 'a second rewrote the past')
  })
})

test('asking for a market that cannot exist returns what does', () => {
  const series = generateCandles({ timeframe: '1w', count: 5, until: marketEpoch })
  assert.equal(series.length, 1, 'a week was invented inside the first week')
  assert.equal(series[0].time, marketEpoch)
})

test('an unknown timeframe is refused rather than guessed at', () => {
  assert.throws(() => generateCandles({ timeframe: '3h', count: 10, until: IN_2026 }))
})

test('a live bar is the part of the day that has actually happened', () => {
  const now = Date.now()
  // A minute or less is drawn from ticks on both sides of the close, so the cut
  // candle is strictly inside the whole one. Anything longer reads its extremes
  // from the minute grid and takes only its last price from the ticks, so it may
  // stand a single tick's excursion proud of the bar it is growing into — bounded
  // here, because a bound that only holds on average is a flake waiting to happen.
  const oneTick = 0.01
  for (const timeframe of ['1m', '1h', '1d', '1w']) {
    const live = generateCandles({ timeframe, count: 8, until: now, live: true })
    const whole = generateCandles({ timeframe, count: 8, until: now })
    assert.equal(live.length, whole.length, `${timeframe} lost a bar`)
    // Only the last bar may differ, or the chart would rewrite history as it ticks.
    assert.deepEqual(live.slice(0, -1), whole.slice(0, -1), `${timeframe} changed a closed bar`)
    const cut = live[live.length - 1]
    const full = whole[whole.length - 1]
    const slack = timeframe === '1m' ? 0 : full.close * oneTick
    assert.equal(cut.time, full.time)
    assert.equal(cut.open, full.open, `${timeframe} cut bar opened elsewhere`)
    assert.ok(cut.high <= full.high + slack + 1e-9, `${timeframe} cut bar reached higher than the day did`)
    assert.ok(cut.low >= full.low - slack - 1e-9, `${timeframe} cut bar reached lower than the day did`)
    assert.ok(cut.low <= Math.min(cut.open, cut.close) && Math.max(cut.open, cut.close) <= cut.high)
    assert.ok(cut.volume > 0 && cut.volume <= full.volume + 0.005, `${timeframe} cut bar traded oddly`)
  }
})

test('a bar dated in the future is left whole', () => {
  // Cutting a bar that has not opened yet would hand the chart a row of zeros.
  const ahead = Date.now() + 3 * DAY_MS
  const live = generateCandles({ timeframe: '1h', count: 4, until: ahead, live: true })
  const whole = generateCandles({ timeframe: '1h', count: 4, until: ahead })
  assert.deepEqual(live, whole)
  for (const bar of live) assert.ok(Number.isFinite(bar.open) && bar.open > 0)
})

test('a live bar grows towards the one that closed', () => {
  // A day bar cut early has to sit inside the day it is part of, which is what
  // makes the chart look like a market rather than a slideshow.
  const whole = generateCandles({ timeframe: '1d', count: 2, until: Date.now() })[1]
  const live = generateCandles({ timeframe: '1d', count: 2, until: Date.now(), live: true })[1]
  assert.ok(live.high - live.low <= whole.high - whole.low + 1e-9)
  assert.ok(live.volume > 0)
})

test('a range read on the minute grid is the candle series, minus the shadows it cannot see', () => {
  const from = Date.UTC(2026, 0, 2, 0, 0, 0)
  const to = Date.UTC(2026, 0, 3, 0, 0, 0)
  const extremes = minuteExtremesBetween(from, to)
  const series = generateCandles({ timeframe: '1m', count: 1440, until: to })

  // A minute candle is drawn from ticks and can dip below the boundaries the grid
  // offers, so the grid's answer has to sit inside the series', never outside it.
  let seriesLow = Number.POSITIVE_INFINITY
  let seriesHigh = Number.NEGATIVE_INFINITY
  for (const bar of series) {
    if (bar.low < seriesLow) seriesLow = bar.low
    if (bar.high > seriesHigh) seriesHigh = bar.high
  }
  assert.ok(extremes.low >= seriesLow, `${extremes.low} should not be below ${seriesLow}`)
  assert.ok(extremes.high <= seriesHigh, `${extremes.high} should not be above ${seriesHigh}`)
  // And it has to agree with the grid it claims to read, to the tick.
  const inSeries = series.some((bar) => bar.time === extremes.lowAt)
  assert.ok(inSeries, 'the low sits on a minute the series also has')
  assert.ok(extremes.highAt >= extremes.lowAt)
})

test('a range that has not happened yet, or has not happened at all, is answered rather than thrown', () => {
  const before = marketEpoch - 86_400_000
  const early = minuteExtremesBetween(before, marketEpoch)
  assert.ok(Number.isFinite(early.low) && early.high >= early.low)
  const empty = minuteExtremesBetween(marketEpoch, marketEpoch)
  assert.equal(empty.low, empty.high, 'a single moment has one price')
  assert.equal(empty.lowAt, marketEpoch)
})

// ------------------------------------------------------- the published market

test('the defaults are the market the site already published', () => {
  // Taken from the generator before the knobs became data, across the two branches
  // that draw from different paths: ticks for the sub-minute frames, the minute
  // grid for the rest. If this fails, the published market has moved, and every
  // reader's saved game has moved with it.
  const golden = {
    '1s': [ // until 1790467198001
      { time: 1790467197000, open: 133827.23, high: 133832.67, low: 133821.41, close: 133822.77, volume: 2.27 },
      { time: 1790467198000, open: 133822.77, high: 133836.59, low: 133822.77, close: 133832.11, volume: 2.46 }
    ],
    '1h': [ // until 1790424000001
      { time: 1790424000000, open: 133940.63, high: 135286.07, low: 130508.09, close: 134567.42, volume: 21745.75 }
    ],
    '1d': [ // until 1789603200001
      { time: 1789430400000, open: 129963.08, high: 132144.82, low: 128420.05, close: 131022.02, volume: 135185.69 },
      { time: 1789516800000, open: 131022.02, high: 135760.66, low: 127030.27, close: 132799.64, volume: 209778.23 },
      { time: 1789603200000, open: 132799.64, high: 139784.89, low: 131996.54, close: 139335.69, volume: 84577.01 }
    ]
  }

  for (const [timeframe, bars] of Object.entries(golden)) {
    const asked = generateCandles({ timeframe, count: bars.length, until: bars[bars.length - 1].time + 1 })
    assert.deepEqual(asked, bars, `the ${timeframe} market moved`)
  }
})

test('a lab can ask for a different market without moving the published one', () => {
  const until = IN_2026
  const published = () => generateCandles({ timeframe: '1d', count: 30, until })
  const before = published()

  // The cache is keyed on the knobs, so a tuned run and the published run interleave
  // here in the order that would expose a shared day: tuned, published, tuned again.
  const wild = { dailyVolatility: 3, jumpChancePerDay: 0.5, baseDailyVolume: 1 }
  const wildBars = generateCandles({ timeframe: '1d', count: 30, until, params: wild })
  assert.deepEqual(published(), before, 'a tuned market reached the published cache')
  assert.deepEqual(generateCandles({ timeframe: '1d', count: 30, until, params: wild }), wildBars)

  // And the tuned market really is a different one, not the same path renamed.
  assert.notDeepEqual(wildBars, before)
  const spread = (bars) => (Math.max(...bars.map((bar) => bar.high)) / Math.min(...bars.map((bar) => bar.low)))
  assert.ok(spread(wildBars) > spread(before), 'the tuned market is not wilder')
})

test('an unknown knob is ignored and a half-set one is finished from the defaults', () => {
  // The lab builds its parameters from a form, so a field the generator does not
  // know about has to be harmless rather than silently become a market.
  const loose = resolveParams({ driftPerDay: 0.002, notAKnob: 7, activityPeaks: [{ hour: 3, amp: 1, width: 2 }] })
  assert.equal(loose.driftPerDay, 0.002)
  assert.equal('notAKnob' in loose, false)
  assert.equal(loose.burstSpread, marketDefaults.burstSpread)
  assert.equal(loose.activityPeaks.length, 1)
  assert.equal(resolveParams().trendPeriods, marketDefaults.trendPeriods, 'the defaults are shared, not copied')

  // Two markets that differ are told apart, and one market is told from itself.
  assert.equal(paramsKey(resolveParams()), paramsKey(resolveParams({})))
  assert.notEqual(paramsKey(resolveParams({})), paramsKey(resolveParams({ driftPerDay: 0.00056 })))
})

// ------------------------------------------------------------- the lab's knobs

test('every knob the lab exposes is a knob the generator has', () => {
  // The lab builds its sliders from this list and hands the result straight to the
  // generator, so a field that names something the model does not have would be a
  // control that silently does nothing.
  const unknown = labFields.filter((field) => !(field.key in marketDefaults))
  assert.deepEqual(unknown.map((field) => field.key), [])

  // Every field starts on the published value, and every one of them is a number
  // the generator will accept rather than a label.
  for (const { field, value } of presetFields(labPresets[0])) {
    assert.equal(value, field.fallback, `${field.key} does not start on the published value`)
    assert.ok(Number.isFinite(value))
  }

  // The ranges have to admit their own default, or the slider would open with the
  // thumb pinned to an end and the first drag would jump.
  for (const field of labFields) {
    assert.ok(field.min <= field.fallback && field.fallback <= field.max, `${field.key} default is out of range`)
    assert.ok(field.step > 0, `${field.key} has no step`)
  }
})

test('an untouched slider sends nothing and a moved one sends exactly itself', () => {
  const fields = labFields.map((field) => ({ field, value: field.fallback }))
  assert.deepEqual(overridesFrom(fields), {}, 'an untouched field was sent to the generator')

  const first = labFields[0]
  const moved = fields.map((entry) => (entry.field === first ? { field: entry.field, value: first.fallback * 2 } : entry))
  const overrides = overridesFrom(moved)
  assert.deepEqual(Object.keys(overrides), [first.key])
  assert.equal(overrides[first.key], first.fallback * 2)

  // A list-valued knob keeps the entries it was not given, and an entry that holds
  // more than a number keeps the parts of it that are not on a slider.
  const peak = labFields.find((field) => field.key === 'activityPeaks' && field.index === 1)
  const one = fields.map((entry) => (entry.field === peak ? { field: entry.field, value: 1.5 } : entry))
  const peaks = overridesFrom(one).activityPeaks
  assert.equal(peaks[1].amp, 1.5)
  assert.equal(peaks[1].hour, marketDefaults.activityPeaks[1].hour)
  assert.equal(peaks[1].width, marketDefaults.activityPeaks[1].width)
  assert.deepEqual(peaks[0], marketDefaults.activityPeaks[0])
  assert.equal(peaks.length, marketDefaults.activityPeaks.length)
})

test('a preset moves the sliders and nothing else', () => {
  for (const preset of labPresets) {
    const fields = presetFields(preset)
    const changed = changedCount(fields)
    if (preset.id === 'published') assert.equal(changed, 0, 'the published preset moved a slider')
    else assert.ok(changed > 0, `${preset.id} moved nothing`)
    // And a preset is reachable by hand: the values it sets are all in range.
    for (const { field, value } of fields) {
      assert.ok(value >= field.min && value <= field.max, `${preset.id} pushes ${field.key} out of range`)
    }
  }
  // The contrasting presets have to disagree in the direction their names promise,
  // or picking one would not show what it is for.
  const valueOf = (id, key) => {
    const entry = presetFields(labPresets.find((preset) => preset.id === id)).find((item) => item.field.key === key)
    return entry.value
  }
  assert.ok(valueOf('calm', 'dailyVolatility') < valueOf('published', 'dailyVolatility'))
  assert.ok(valueOf('wild', 'dailyVolatility') > valueOf('published', 'dailyVolatility'))
  assert.ok(valueOf('crash', 'driftPerDay') < 0)
  assert.equal(valueOf('chain', 'intradayJumpsPerDay'), 0)
})

// ------------------------------------------------------------- the way in

test('the lab opens on a double-click and not on a stray one', () => {
  // One click is a click on a fingerprint. Two in a row are a request for the page
  // that explains where the fingerprint came from.
  const tap = (...times) => {
    const run = times.reduce((state, at) => advanceClicks(state, at, doubleClickWindowMs), newSequence())
    return takeRun(run, doubleClicks).reached
  }
  assert.equal(doubleClicks, 2)
  assert.equal(tap(0), false, 'one click is just a click on a fingerprint')
  assert.equal(tap(0, 200), true)
  assert.equal(tap(0, 1_500), false, 'two slow clicks are two gestures')
  assert.equal(tap(0, 200, 260), true)

  // The window is short enough that scrolling or dragging past the icon cannot
  // land the pair that opens the page.
  assert.ok(doubleClickWindowMs <= 500)
  assert.equal(tap(0, 100, 900), false)
})
