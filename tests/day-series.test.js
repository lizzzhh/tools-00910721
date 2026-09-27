import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  dayDistance,
  dayFromKey,
  dayKey,
  pruneDaySeries,
  readDaySeries,
  recentDayKeys,
  recordedPoints,
  setDay,
  shortDayLabel,
  todayKey,
  trendDays,
  trendWindow,
  windowPoints
} from '../src/lib/day-series.ts'

/** Local noon, so a test never sits on a daylight-saving boundary by accident. */
const day = (text) => dayFromKey(text)

test('keys a date by its own local calendar day', () => {
  assert.equal(dayKey(new Date(2026, 8, 27, 23, 59)), '2026-09-27')
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01')
  assert.equal(dayKey(new Date(2026, 11, 31, 12, 0)), '2026-12-31')
  assert.equal(todayKey(new Date(2026, 8, 27)), '2026-09-27')
})

test('reads a key back as the same local day', () => {
  const date = dayFromKey('2026-02-28')
  assert.equal(dayKey(date), '2026-02-28')
  assert.equal(date.getMonth(), 1)
  assert.equal(date.getDate(), 28)
})

test('counts whole days between keys across month and year ends', () => {
  assert.equal(dayDistance('2026-09-27', '2026-09-27'), 0)
  assert.equal(dayDistance('2026-09-27', '2026-09-28'), 1)
  assert.equal(dayDistance('2026-09-28', '2026-09-27'), -1)
  assert.equal(dayDistance('2026-02-28', '2026-03-01'), 1)
  assert.equal(dayDistance('2024-02-28', '2024-03-01'), 2)
  assert.equal(dayDistance('2026-12-31', '2027-01-01'), 1)
})

test('lists the requested window oldest first and ending today', () => {
  assert.deepEqual(recentDayKeys(3, day('2026-09-27')), ['2026-09-25', '2026-09-26', '2026-09-27'])
  assert.deepEqual(recentDayKeys(1, day('2026-09-27')), ['2026-09-27'])
  assert.deepEqual(recentDayKeys(14, day('2026-03-01')).slice(0, 2), ['2026-02-16', '2026-02-17'])
  assert.deepEqual(recentDayKeys(0, day('2026-09-27')), [])
  assert.deepEqual(recentDayKeys(-4, day('2026-09-27')), [])
})

test('keeps only day keys holding a count', () => {
  assert.deepEqual(readDaySeries({ '2026-09-27': 3, '2026-09-26': 0 }), { '2026-09-27': 3, '2026-09-26': 0 })
  assert.deepEqual(readDaySeries({ '2026-09-27': '4' }), { '2026-09-27': 4 })
  assert.deepEqual(readDaySeries({ yesterday: 3, '2026-9-27': 3, '2026-09-27': 3 }), { '2026-09-27': 3 })
  assert.deepEqual(readDaySeries({ '2026-09-27': -1, '2026-09-26': Number.NaN, '2026-09-25': Infinity }), {})
  assert.deepEqual(readDaySeries(null), {})
  assert.deepEqual(readDaySeries(undefined), {})
  assert.deepEqual(readDaySeries([{ date: '2026-09-27', value: 1 }]), {})
  assert.deepEqual(readDaySeries('2026-09-27'), {})
})

test('drops the days that fall out of the window', () => {
  const series = { '2026-09-20': 1, '2026-09-25': 2, '2026-09-27': 3 }
  assert.deepEqual(pruneDaySeries(series, 2), { '2026-09-25': 2, '2026-09-27': 3 })
  assert.deepEqual(pruneDaySeries(series, 10), series)
  assert.deepEqual(pruneDaySeries(series, 0), {})
  assert.deepEqual(pruneDaySeries({}, 5), {})
})

test('records a day by replacing what was there', () => {
  const set = setDay({ '2026-09-20': 5, '2026-09-26': 1 }, day('2026-09-27'), 88, 90)
  assert.deepEqual(set, { '2026-09-20': 5, '2026-09-26': 1, '2026-09-27': 88 })
  assert.deepEqual(setDay(set, day('2026-09-27'), 92, 90)['2026-09-27'], 92)
})

test('refuses to record a value that is not a number', () => {
  const series = { '2026-09-27': 4 }
  assert.deepEqual(setDay(series, day('2026-09-27'), Number.NaN, 90), series)
})

test('prunes on write so a stored series cannot grow without bound', () => {
  let series = {}
  for (let offset = 0; offset <= 20; offset += 1) {
    series = setDay(series, new Date(2026, 8, 7 + offset), offset, 5)
  }
  assert.deepEqual(Object.keys(series), ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  assert.equal(series['2026-09-27'], 20)
})

test('a window starts at the first day on record so the curve grows from the right', () => {
  const today = day('2026-09-27')
  assert.deepEqual(trendWindow({ '2026-09-27': 92, '2026-09-26': 71 }, 14, today), {
    start: '2026-09-26',
    days: 14
  })
  assert.deepEqual(trendWindow({ '2026-09-27': 92 }, 14, today), { start: '2026-09-27', days: 14 })
  assert.deepEqual(trendWindow({}, 14, today), { start: '2026-09-14', days: 14 })
  // Anything older than the window, or dated in the future, is not part of it.
  assert.deepEqual(trendWindow({ '2026-01-01': 92, '2026-12-31': 88 }, 14, today), {
    start: '2026-09-14',
    days: 14
  })
  assert.deepEqual(trendWindow({ '2026-09-27': 92 }, 0, today), { start: '2026-09-27', days: 1 })
})

test('a filled window reports every day, and a missing day is zero', () => {
  const points = windowPoints({ '2026-09-25': 2, '2026-09-27': 5 }, 3, day('2026-09-27'))
  assert.deepEqual(points, [
    { date: '2026-09-25', value: 2 },
    { date: '2026-09-26', value: 0 },
    { date: '2026-09-27', value: 5 }
  ])
  assert.deepEqual(windowPoints({}, 2, day('2026-09-27')), [
    { date: '2026-09-26', value: 0 },
    { date: '2026-09-27', value: 0 }
  ])
})

test('recorded days leave out the ones that were never written down', () => {
  const series = { '2026-09-24': 3, '2026-09-26': 7, '2026-09-27': 9, '2026-09-28': 11 }
  assert.deepEqual(recordedPoints(series, '2026-09-24', day('2026-09-27')), [
    { date: '2026-09-24', value: 3 },
    { date: '2026-09-26', value: 7 },
    { date: '2026-09-27', value: 9 }
  ])
  assert.deepEqual(recordedPoints(series, '2026-09-27', day('2026-09-27')), [{ date: '2026-09-27', value: 9 }])
  assert.deepEqual(recordedPoints(series, '2026-09-14', day('2026-09-20')), [])
})

test('an axis label drops the year', () => {
  assert.equal(shortDayLabel('2026-09-27'), '09-27')
  assert.equal(shortDayLabel('2026-01-05'), '01-05')
})

test('a zero filled axis reports every day of the window', () => {
  const { categories, values, highest } = trendDays({ '2026-09-25': 2, '2026-09-27': 5 }, 3, day('2026-09-27'), 'zero')
  assert.deepEqual(categories, ['2026-09-25', '2026-09-26', '2026-09-27'])
  assert.deepEqual(values, [2, 0, 5])
  assert.equal(highest, 5)
})

test('a recorded axis leaves the days nobody drew empty', () => {
  const series = { '2026-09-25': 92, '2026-09-27': 71 }
  const { categories, values, highest } = trendDays(series, 3, day('2026-09-27'), 'recorded')
  assert.deepEqual(categories, ['2026-09-25', '2026-09-26', '2026-09-27'])
  assert.deepEqual(values, [92, null, 71])
  assert.equal(highest, 92)
})

test('a recorded axis starts at the first day on record, so the curve grows rightwards', () => {
  const { categories, values } = trendDays({ '2026-09-26': 88 }, 14, day('2026-09-27'), 'recorded')
  assert.deepEqual(categories, ['2026-09-26', '2026-09-27'])
  assert.deepEqual(values, [88, null])
})

test('an empty series has nothing to draw', () => {
  const { categories, values, highest } = trendDays({}, 4, day('2026-09-27'), 'zero')
  assert.equal(categories.length, 4)
  assert.deepEqual(values, [0, 0, 0, 0])
  assert.equal(highest, 0)
  assert.equal(trendDays({}, 4, day('2026-09-27'), 'recorded').highest, 0)
})

test('a window of one day still has an axis', () => {
  assert.deepEqual(trendDays({ '2026-09-27': 3 }, 1, day('2026-09-27'), 'zero'), {
    categories: ['2026-09-27'],
    values: [3],
    highest: 3
  })
})
