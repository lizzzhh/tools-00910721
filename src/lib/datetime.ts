/** Codes the UI maps to `toolUi.timestamp-converter.errors.*`. */
export type DateTimeErrorCode =
  | 'needTimestamp'
  | 'needDateTime'
  | 'notInteger'
  | 'unsafeInteger'
  | 'invalidTimestamp'
  | 'outOfRange'
  | 'unrecognisedFormat'
  | 'outOfValidRange'

export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds'

export type DateDirection = 'from-timestamp' | 'from-date'

export type TimestampResult =
  | {
      ok: true
      output: string
      date: Date
      unit: Exclude<TimestampUnit, 'auto'>
      timestamp: number
    }
  | {
      ok: false
      code: DateTimeErrorCode
    }

export type DateParts = {
  iso: string
  utc: string
  local: string
  date: string
  time: string
  /** 0 = Sunday. The UI formats the name with the active locale. */
  weekdayIndex: number
  timezone: string
  offset: string
  unixSeconds: string
  unixMilliseconds: string
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0')
}

export function getTimezoneOffset(date: Date) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`
}

export function describeDate(date: Date): DateParts {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const localTime = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  return {
    iso: date.toISOString(),
    utc: `${date.toUTCString()}`,
    local: `${localDate} ${localTime}`,
    date: localDate,
    time: localTime,
    weekdayIndex: date.getDay(),
    timezone,
    offset: getTimezoneOffset(date),
    unixSeconds: String(Math.floor(date.getTime() / 1000)),
    unixMilliseconds: String(date.getTime())
  }
}

function detectUnit(value: number): Exclude<TimestampUnit, 'auto'> {
  const magnitude = Math.abs(value)
  if (magnitude < 1e11) return 'seconds'
  return 'milliseconds'
}

export function parseTimestamp(input: string, unit: TimestampUnit = 'auto'): TimestampResult {
  const value = input.trim()
  if (!value) return { ok: false, code: 'needTimestamp' }

  if (!/^[+-]?\d+$/.test(value)) return { ok: false, code: 'notInteger' }

  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric)) return { ok: false, code: 'unsafeInteger' }

  const resolved = unit === 'auto' ? detectUnit(numeric) : unit
  const date = new Date(resolved === 'seconds' ? numeric * 1000 : numeric)

  if (Number.isNaN(date.getTime())) return { ok: false, code: 'invalidTimestamp' }
  const year = date.getUTCFullYear()
  if (year < 1 || year > 9999) return { ok: false, code: 'outOfRange' }

  return { ok: true, output: date.toISOString(), date, unit: resolved, timestamp: date.getTime() }
}

const dateTimePattern = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?\s*(Z|[+-]\d{2}:?\d{2})?)?$/

/** Days in a month, leap years included, so `2023-02-31` is refused rather than moved. */
function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

type DateNumbers = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number }

/**
 * Builds a UTC moment from the numbers as written, for the same reason the local
 * path corrects the year: `Date.UTC` reads 0-99 as 19xx.
 */
function buildUtc(numbers: DateNumbers, offsetMs: number): Date {
  const date = new Date(0)
  date.setUTCFullYear(numbers.year, numbers.month, numbers.day)
  date.setUTCHours(numbers.hour, numbers.minute, numbers.second, numbers.millisecond)
  return new Date(date.getTime() + offsetMs)
}

export function parseDateInput(input: string, assumeUtc = false): TimestampResult {
  const value = input.trim()
  if (!value) return { ok: false, code: 'needDateTime' }

  if (/^\d{9,}$/.test(value)) return parseTimestamp(value, 'auto')

  const match = dateTimePattern.exec(value)
  if (!match) return { ok: false, code: 'unrecognisedFormat' }

  const [, year, month, day, hour, minute, second, millisecond, zone] = match
  const numbers = {
    year: Number(year),
    month: Number(month) - 1,
    day: Number(day),
    hour: hour === undefined ? 0 : Number(hour),
    minute: Number(minute ?? 0),
    second: Number(second ?? 0),
    millisecond: Number((millisecond ?? '0').padEnd(3, '0'))
  }

  const invalid =
    numbers.year < 1 ||
    numbers.month < 0 ||
    numbers.month > 11 ||
    // A day that the month does not have is not a date: the Date constructor
    // would carry it into the next month and answer 2023-03-03 for 2023-02-31.
    numbers.day < 1 ||
    numbers.day > daysInMonth(numbers.year, Math.max(numbers.month, 0)) ||
    numbers.hour > 23 ||
    numbers.minute > 59 ||
    numbers.second > 59

  if (invalid) return { ok: false, code: 'outOfValidRange' }

  const normalizedZone = zone ? zone.replace(':', '') : ''
  const hasZone = normalizedZone !== ''

  let date: Date
  if (hasZone) {
    const shift = normalizedZone === 'Z' ? 0 : (normalizedZone[0] === '-' ? -1 : 1) * (Number(normalizedZone.slice(1, 3)) * 60 + Number(normalizedZone.slice(3)))
    date = buildUtc(numbers, -shift * 60000)
  } else if (assumeUtc) {
    date = buildUtc(numbers, 0)
  } else {
    date = new Date(numbers.year, numbers.month, numbers.day, numbers.hour, numbers.minute, numbers.second, numbers.millisecond)
    // Years below 100 are read as 19xx by the Date constructor, so 0099 would
    // come back as 1999. setFullYear takes the year as written.
    if (numbers.year < 100) date.setFullYear(numbers.year)
  }

  if (Number.isNaN(date.getTime())) return { ok: false, code: 'outOfValidRange' }

  return { ok: true, output: date.toISOString(), date, unit: 'milliseconds', timestamp: date.getTime() }
}

export function formatTimestamp(date: Date, options: { milliseconds?: boolean } = {}) {
  const { milliseconds = false } = options
  const iso = date.toISOString()
  return milliseconds ? iso.replace('T', ' ').replace('Z', ' UTC') : iso.replace(/\.\d{3}Z$/, 'Z')
}
