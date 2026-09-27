/**
 * One number per calendar day, keyed `YYYY-MM-DD` in the reader's own time zone.
 * The dashboard plots a day axis, so the history it keeps has to survive being
 * stored, being pruned and being read back months later without drifting into
 * the wrong day.
 *
 * Pure on purpose: the browser scripts and the node tests share these rules,
 * and a day key is only ever built from local date parts, so no time zone can
 * shift a count onto the day before or after it.
 */

/** A value per day. A day that is missing was never recorded, which is not zero. */
export type DaySeries = Record<string, number>

/** A single plotted day. */
export type DayPoint = { date: string; value: number }

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/

const pad = (value: number) => String(value).padStart(2, '0')

/** The local `YYYY-MM-DD` of a date, which is how the site has always keyed days. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today's key, for everything that writes a day as it goes. */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now)
}

/** Reads a key back as a local date, so a round trip cannot land on a UTC day. */
export function dayFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Moves a date by whole days. `setDate` settles month and year ends on its own. */
export function shiftDay(date: Date, offset: number): Date {
  const moved = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  moved.setDate(moved.getDate() + offset)
  return moved
}

/** Whole days from one key to another. Rounding absorbs a daylight-saving hour. */
export function dayDistance(from: string, to: string): number {
  return Math.round((dayFromKey(to).getTime() - dayFromKey(from).getTime()) / 86_400_000)
}

/** The last `days` keys ending on `today`, oldest first. */
export function recentDayKeys(days: number, today: Date): string[] {
  const total = Math.max(Math.trunc(days) || 0, 0)
  const keys: string[] = []
  for (let offset = total - 1; offset >= 0; offset -= 1) keys.push(dayKey(shiftDay(today, -offset)))
  return keys
}

/**
 * Keeps only the days of a parsed value that could have been recorded: a real
 * day key holding a count. Anything else is a hand-edited backup or a value
 * from an older build, and is dropped rather than drawn.
 */
export function readDaySeries(value: unknown): DaySeries {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const series: DaySeries = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const count = Number(entry)
    if (!dayKeyPattern.test(key) || !Number.isFinite(count) || count < 0) continue
    series[key] = count
  }
  return series
}

/** The newest `keepDays` days, ascending. Padded keys sort chronologically. */
export function pruneDaySeries(series: DaySeries, keepDays: number): DaySeries {
  const keep = Math.max(Math.trunc(keepDays) || 0, 0)
  const keys = Object.keys(series).sort()
  const kept: DaySeries = {}
  for (const key of keys.slice(Math.max(keys.length - keep, 0))) kept[key] = series[key]
  return kept
}

/** Records a day's value, replacing what was there, and drops days that fell out. */
export function setDay(series: DaySeries, date: Date, value: number, keepDays: number): DaySeries {
  return pruneDaySeries(Number.isFinite(value) ? { ...series, [dayKey(date)]: value } : series, keepDays)
}

/**
 * The day axis to draw: today on the right, and up to `days` days of history
 * before it. A series that only starts today does not stretch back over days
 * the reader never played, so its curve grows from the right edge.
 */
export function trendWindow(series: DaySeries, days: number, today: Date): { start: string; days: number } {
  const total = Math.max(Math.trunc(days) || 0, 1)
  const last = dayKey(today)
  const floor = dayKey(shiftDay(today, -(total - 1)))
  const first = Object.keys(series)
    .filter((key) => key >= floor && key <= last)
    .sort()[0]
  return { start: first && first > floor ? first : floor, days: total }
}

/** Every day of the window, oldest first, with a day that was never recorded as zero. */
export function windowPoints(series: DaySeries, days: number, today: Date): DayPoint[] {
  return recentDayKeys(days, today).map((date) => ({ date, value: series[date] ?? 0 }))
}

/** Only the days that were really recorded, oldest first. */
export function recordedPoints(series: DaySeries, from: string, today: Date): DayPoint[] {
  const last = dayKey(today)
  return Object.keys(series)
    .filter((key) => key >= from && key <= last)
    .sort()
    .map((date) => ({ date, value: series[date] }))
}

/** An axis label short enough to sit under a point without crowding its neighbour. */
export function shortDayLabel(key: string): string {
  return key.slice(5)
}

/**
 * A day axis and the value standing on each of its days, which is all a line
 * chart needs.
 *
 * `zero` fills a day nobody used a tool with a zero, because that is what
 * happened. `recorded` leaves it empty instead, because a fortune is only ever
 * drawn on some days and joining the line across the rest would report a day
 * that never happened. Its axis also starts at the first day on record, so a
 * curve that begins today grows from the right instead of stretching back over
 * days the reader never played.
 */
export function trendDays(
  series: DaySeries,
  days: number,
  today: Date,
  fill: 'zero' | 'recorded'
): { categories: string[]; values: (number | null)[]; highest: number } {
  const total = Math.max(Math.trunc(days) || 0, 1)
  const recorded = fill === 'recorded'
  const start = recorded ? trendWindow(series, total, today).start : dayKey(shiftDay(today, -(total - 1)))
  const categories = recentDayKeys(dayDistance(start, dayKey(today)) + 1, today)
  const points = recorded ? recordedPoints(series, start, today) : windowPoints(series, total, today)
  const byDate = new Map(points.map((point) => [point.date, point.value]))
  const values = categories.map((date) => byDate.get(date) ?? (recorded ? null : 0))
  return { categories, values, highest: points.reduce((max, point) => (point.value > max ? point.value : max), 0) }
}
