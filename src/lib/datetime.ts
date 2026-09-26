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
      message: string
    }

export type DateParts = {
  iso: string
  utc: string
  local: string
  date: string
  time: string
  weekday: string
  timezone: string
  offset: string
  unixSeconds: string
  unixMilliseconds: string
}

const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

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
    weekday: weekdays[date.getDay()],
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
  if (!value) return { ok: false, message: '请输入时间戳' }

  if (!/^[+-]?\d+$/.test(value)) return { ok: false, message: '时间戳只能是整数秒或毫秒' }

  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric)) return { ok: false, message: '时间戳超出安全整数范围' }

  const resolved = unit === 'auto' ? detectUnit(numeric) : unit
  const date = new Date(resolved === 'seconds' ? numeric * 1000 : numeric)

  if (Number.isNaN(date.getTime())) return { ok: false, message: '时间戳无法转换为有效日期' }
  const year = date.getUTCFullYear()
  if (year < 1 || year > 9999) return { ok: false, message: '时间戳超出可表示的日期范围' }

  return { ok: true, output: date.toISOString(), date, unit: resolved, timestamp: date.getTime() }
}

const dateTimePattern = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?\s*(Z|[+-]\d{2}:?\d{2})?)?$/

export function parseDateInput(input: string, assumeUtc = false): TimestampResult {
  const value = input.trim()
  if (!value) return { ok: false, message: '请输入日期或时间' }

  if (/^\d{9,}$/.test(value)) return parseTimestamp(value, 'auto')

  const match = dateTimePattern.exec(value)
  if (!match) return { ok: false, message: '日期格式无法识别，请使用 2026-01-31 08:30:00 这样的写法' }

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
    numbers.month < 0 ||
    numbers.month > 11 ||
    numbers.day < 1 ||
    numbers.day > 31 ||
    numbers.hour > 23 ||
    numbers.minute > 59 ||
    numbers.second > 59

  if (invalid) return { ok: false, message: '日期或时间数值超出有效范围' }

  const normalizedZone = zone ? zone.replace(':', '') : ''
  const hasZone = normalizedZone !== ''

  let date: Date
  if (hasZone) {
    const shift = normalizedZone === 'Z' ? 0 : (normalizedZone[0] === '-' ? -1 : 1) * (Number(normalizedZone.slice(1, 3)) * 60 + Number(normalizedZone.slice(3)))
    date = new Date(Date.UTC(numbers.year, numbers.month, numbers.day, numbers.hour, numbers.minute, numbers.second, numbers.millisecond) - shift * 60000)
  } else if (assumeUtc) {
    date = new Date(Date.UTC(numbers.year, numbers.month, numbers.day, numbers.hour, numbers.minute, numbers.second, numbers.millisecond))
  } else {
    date = new Date(numbers.year, numbers.month, numbers.day, numbers.hour, numbers.minute, numbers.second, numbers.millisecond)
  }

  if (Number.isNaN(date.getTime())) return { ok: false, message: '日期数值超出有效范围' }

  return { ok: true, output: date.toISOString(), date, unit: 'milliseconds', timestamp: date.getTime() }
}

export function formatTimestamp(date: Date, options: { milliseconds?: boolean } = {}) {
  const { milliseconds = false } = options
  const iso = date.toISOString()
  return milliseconds ? iso.replace('T', ' ').replace('Z', ' UTC') : iso.replace(/\.\d{3}Z$/, 'Z')
}
