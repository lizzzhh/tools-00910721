/**
 * Time zone conversion.
 *
 * The whole trick is that a wall-clock time in `Asia/Tokyo` is not a `Date` until
 * you know which instant it names, and the offset that would tell you is itself
 * a function of the instant. So the conversion is done in two passes: guess with
 * the offset at the naive instant, then re-read the zone at the guessed instant
 * and correct once. That settles every real zone, including the half-hour and
 * daylight-saving ones, without a table of offsets to keep up to date.
 */

export type ZoneId = string

/** Zones offered by default. A curated list reads better than 400 entries. */
export const commonZones = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland'
] as const

/** Every zone the runtime knows, when it is willing to say. */
export function allZones(): ZoneId[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof supported === 'function') {
    try {
      return supported('timeZone')
    } catch {
      return [...commonZones]
    }
  }
  return [...commonZones]
}

export function localZone(): ZoneId {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(zone: ZoneId, locale = 'en') {
  const key = `${locale}|${zone}`
  const cached = formatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    timeZoneName: 'shortOffset'
  })
  formatterCache.set(key, formatter)
  return formatter
}

export type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 is Sunday. */
  weekday: number
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function isValidZone(zone: ZoneId): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** The wall clock a zone is showing at an instant, read back out of `Intl`. */
export function partsIn(zone: ZoneId, at: Date): ZonedParts {
  const parts = formatterFor(zone).formatToParts(at)
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '0'
  const weekdayName = read('weekday')
  // `hour12: false` still yields 24 for midnight in some runtimes.
  const hour = Number(read('hour')) % 24
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour,
    minute: Number(read('minute')),
    second: Number(read('second')),
    weekday: Math.max(0, weekdays.indexOf(weekdayName))
  }
}

const asUtc = (parts: ZonedParts) => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)

/** Minutes east of UTC that `zone` is at, positive in Asia, negative in America. */
export function offsetMinutes(zone: ZoneId, at: Date): number {
  return Math.round((asUtc(partsIn(zone, at)) - at.getTime()) / 60_000)
}

/** The short offset label, `GMT+8` or `UTC-05:00`, as the runtime words it. */
export function offsetLabel(zone: ZoneId, at: Date): string {
  const name = formatterFor(zone).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value ?? ''
  return name
}

/**
 * Turns a wall clock in `zone` into the instant it names. Two passes are enough:
 * the first guess uses the offset at the naive instant, and the second corrects
 * it with the offset actually in force a few hours later, which is what catches
 * the days a zone crosses a daylight-saving boundary.
 */
export function instantIn(zone: ZoneId, parts: ZonedParts): Date {
  const naive = asUtc(parts)
  const firstGuess = naive - offsetMinutes(zone, new Date(naive)) * 60_000
  const corrected = naive - offsetMinutes(zone, new Date(firstGuess)) * 60_000
  return new Date(corrected)
}

export function localParts(at: Date): ZonedParts {
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
    hour: at.getHours(),
    minute: at.getMinutes(),
    second: at.getSeconds(),
    weekday: at.getDay()
  }
}

export type Conversion = {
  source: ZonedParts
  target: ZonedParts
  sourceOffset: number
  targetOffset: number
  /** How much the wall clock moves when read in the target zone. */
  shiftMinutes: number
  at: Date
}

/** The same instant, read in two zones, with the difference between the two walls. */
export function convert(at: Date, source: ZoneId, target: ZoneId): Conversion {
  const sourceParts = partsIn(source, at)
  const targetParts = partsIn(target, at)
  const sourceOffset = offsetMinutes(source, at)
  const targetOffset = offsetMinutes(target, at)
  return { at, source: sourceParts, target: targetParts, sourceOffset, targetOffset, shiftMinutes: targetOffset - sourceOffset }
}

/** The day of the year a zone is on, which is how a reader spots a date shift. */
export function crossesDay(source: ZonedParts, target: ZonedParts) {
  return source.year !== target.year || source.month !== target.month || source.day !== target.day
}

export function formatZoned(parts: ZonedParts): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
}