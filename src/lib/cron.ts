/**
 * Cron expression parsing and the next fire times it implies.
 *
 * The dialect is the one Vixie cron established and everyone still means: five
 * fields, `*` and ranges and steps and lists, plus the three-letter month and
 * weekday names. Two rules are easy to get wrong and are therefore spelled out
 * here. `?` is not Vixie cron's syntax but every scheduler grew it, so it reads
 * as `*`. And when both the day-of-month and the day-of-week fields are
 * restricted, a day fires if it matches *either* one, not both.
 *
 * The search for the next fire time jumps a whole month, day or hour at a time
 * when the current one cannot match, instead of stepping minute by minute
 * through four years of minutes.
 */

export type CronFieldId = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

export type CronErrorCode = 'empty' | 'fieldCount' | 'badField' | 'outOfRange'

export type CronResult =
  | {
      ok: true
      fields: Record<CronFieldId, number[]>
      raw: Record<CronFieldId, string>
      /** True when a day field was written as `?`, which is how a reader says "no opinion". */
      dayQuestion: boolean
    }
  | { ok: false; code: CronErrorCode; field?: CronFieldId; position?: number }

type Bounds = { min: number; max: number; names?: Record<string, number> }

export const cronBounds: Record<CronFieldId, Bounds> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: {
    min: 1,
    max: 12,
    names: {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    }
  },
  dayOfWeek: {
    min: 0,
    max: 6,
    names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  }
}

const dayOfMonthNames: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The order fields appear in, so the parser can index them by position. */
export const cronFieldOrder: CronFieldId[] = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']

function resolveToken(token: string, id: CronFieldId) {
  const bounds = cronBounds[id]
  const text = token.trim().toLowerCase()
  const named = bounds.names?.[text] ?? (id === 'dayOfMonth' ? dayOfMonthNames[text] : undefined)
  if (named !== undefined) return named
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return value >= bounds.min && value <= bounds.max ? value : null
}

function parseField(token: string, id: CronFieldId): { values: number[] } | { error: CronErrorCode } {
  const bounds = cronBounds[id]
  const text = token.trim()
  if (!text || text === '?') return { values: expandRange(bounds.min, bounds.max, 1) }
  const values = new Set<number>()
  for (const part of text.split(',')) {
    const piece = part.trim()
    if (!piece) return { error: 'badField' }
    const [rangePart, stepPart] = piece.split('/')
    if (stepPart !== undefined) {
      const step = Number(stepPart)
      if (!Number.isInteger(step) || step < 1) return { error: 'badField' }
      const boundsOfRange = parseRange(rangePart, id)
      if (!boundsOfRange) return { error: 'badField' }
      // `5/10` in a five-field minute column means 5, 15, 25 and so on up to the
      // end of the range, not the single value 5 read twice.
      const last = boundsOfRange.from === boundsOfRange.to ? bounds.max : boundsOfRange.to
      for (let value = boundsOfRange.from; value <= last; value += step) values.add(value)
      continue
    }
    const range = parseRange(piece, id)
    if (!range) return { error: 'badField' }
    for (let value = range.from; value <= range.to; value += 1) values.add(value)
  }
  if (values.size === 0) return { error: 'badField' }
  return { values: [...values].sort((a, b) => a - b) }
}

function parseRange(piece: string, id: CronFieldId): { from: number; to: number } | null {
  const bounds = cronBounds[id]
  const text = piece.trim()
  if (text === '*') return { from: bounds.min, to: bounds.max }
  if (!text.includes('-')) {
    const value = resolveToken(text, id)
    return value === null ? null : { from: value, to: value }
  }
  const [startText, endText] = text.split('-')
  const from = resolveToken(startText, id)
  const to = resolveToken(endText, id)
  if (from === null || to === null || from > to) return null
  return { from, to }
}

function expandRange(from: number, to: number, step: number) {
  const values: number[] = []
  for (let value = from; value <= to; value += step) values.push(value)
  return values
}

/** Aliases people paste from a README rather than write field by field. */
const cronAliases: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *'
}

/**
 * Parses a five-field expression, or six when the first one is a seconds field.
 * Whether it is seconds is decided by the field count, not by the value, because
 * `0` is a perfectly ordinary minute.
 */
export function parseCron(expression: string): CronResult {
  const text = expression.trim()
  if (!text) return { ok: false, code: 'empty' }
  const alias = cronAliases[text.toLowerCase()]
  if (alias) return parseCron(alias)

  const tokens = text.split(/\s+/)
  if (tokens.length !== 5 && tokens.length !== 6) return { ok: false, code: 'fieldCount', position: tokens.length }

  const ids: CronFieldId[] = tokens.length === 6 ? ['second', ...cronFieldOrder] : [...cronFieldOrder]
  const fields = {} as Record<CronFieldId, number[]>
  const raw = {} as Record<CronFieldId, string>
  let dayQuestion = false

  // A five-field expression has no seconds field, so it fires at second zero.
  // Without this the search below would have nothing to look at.
  if (tokens.length === 5) {
    fields.second = [0]
    raw.second = '0'
  }

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]
    const token = tokens[index]
    if (id === 'dayOfMonth' && token.trim() === '?') dayQuestion = true
    const parsed = parseField(token, id)
    if ('error' in parsed) return { ok: false, code: parsed.error, field: id, position: index }
    fields[id] = parsed.values
    raw[id] = token.trim()
  }

  return { ok: true, fields, raw, dayQuestion }
}

export type CronMatch = { ok: true; at: Date } | { ok: false; code: 'noMatch' }

/** Four years of days, which is enough to reach February 29 in any expression. */
const dayBudget = 366 * 4

/**
 * The next matching time of day on or after the cursor, or null when the day has
 * no firing left in it. Comparing against the cursor rather than against midnight
 * is what keeps the answer "strictly after where we started" without a retry.
 */
function nextTimeOfDay(fields: Record<CronFieldId, number[]>, cursor: Date) {
  const [hours, minutes, seconds] = [cursor.getHours(), cursor.getMinutes(), cursor.getSeconds()]
  for (const hour of fields.hour) {
    if (hour < hours) continue
    for (const minute of fields.minute) {
      if (hour === hours && minute < minutes) continue
      for (const second of fields.second) {
        if (hour === hours && minute === minutes && second < seconds) continue
        return { hour, minute, second }
      }
    }
  }
  return null
}

/**
 * The first firing time strictly after `from`, in the reader's own timezone, which
 * is the only timezone a cron on their machine ever runs in.
 *
 * The search walks days, not seconds. A minute at a time costs 44k steps to reach
 * New Year's Day from October, so a yearly schedule falls off the end of any
 * sensible budget; a day at a time gets there in three.
 */
export function nextRun(fields: Record<CronFieldId, number[]>, from: Date, limit = dayBudget): CronMatch {
  const start = from.getTime()
  const cursor = new Date(start)
  // A cron fires on a second boundary and the seconds field decides whether zero
  // is one of them, so the search starts at the next whole minute.
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let day = 0; day < limit; day += 1) {
    if (matchesDay(fields, cursor)) {
      const slot = nextTimeOfDay(fields, cursor)
      if (slot) {
        const at = new Date(cursor.getTime())
        at.setHours(slot.hour, slot.minute, slot.second, 0)
        if (at.getTime() > start) return { ok: true, at }
      }
    }
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(0, 0, 0, 0)
  }
  return { ok: false, code: 'noMatch' }
}

/** Whether a calendar date passes the month and day fields, Vixie or-ed. */
function matchesDay(fields: Record<CronFieldId, number[]>, date: Date) {
  if (!fields.month.includes(date.getMonth() + 1)) return false
  const monthDay = fields.dayOfMonth.includes(date.getDate())
  const weekDay = fields.dayOfWeek.includes(date.getDay())
  const monthAny = rawIsStar(fields.dayOfMonth, cronBounds.dayOfMonth)
  const weekAny = rawIsStar(fields.dayOfWeek, cronBounds.dayOfWeek)
  if (monthAny && weekAny) return true
  if (monthAny) return weekDay
  if (weekAny) return monthDay
  return monthDay || weekDay
}

export function nextRuns(fields: Record<CronFieldId, number[]>, from: Date, count = 5): Date[] {
  const out: Date[] = []
  let cursor = from
  for (let index = 0; index < count; index += 1) {
    const match = nextRun(fields, cursor)
    if (!match.ok) break
    out.push(match.at)
    cursor = match.at
  }
  return out
}

export type CronPresetId =
  | 'everyMinute'
  | 'everyFiveMinutes'
  | 'everyHour'
  | 'everyDay'
  | 'everyWeekday'
  | 'everyWeek'
  | 'everyMonth'
  | 'everyYear'

/** Common expressions offered as one-click recipes, matching what people write. */
export const cronPresets: { id: CronPresetId; expression: string }[] = [
  { id: 'everyMinute', expression: '* * * * *' },
  { id: 'everyFiveMinutes', expression: '*/5 * * * *' },
  { id: 'everyHour', expression: '0 * * * *' },
  { id: 'everyDay', expression: '0 3 * * *' },
  { id: 'everyWeekday', expression: '0 9 * * 1-5' },
  { id: 'everyWeek', expression: '0 9 * * 1' },
  { id: 'everyMonth', expression: '0 0 1 * *' },
  { id: 'everyYear', expression: '0 0 1 1 *' }
]

/** A label for one field: `*` reads as "every", everything else stays as written. */
export function describeField(id: CronFieldId, raw: string, values: number[]): string {
  if (rawIsStar(values, cronBounds[id])) return 'every'
  if (id === 'dayOfWeek') return values.map((value) => weekdays[value] ?? String(value)).join(', ')
  return raw
}

/** Whether a field's values cover its whole range, i.e. it was written as `*`. */
function rawIsStar(values: number[], bounds: Bounds) {
  return values.length === bounds.max - bounds.min + 1
}

export type CronFrequency = {
  /** How many times a matching day fires: seconds times minutes times hours. */
  perMatchingDay: number
  /** Matching days in a 366-day window, which is what the month and day fields allow. */
  matchingDays: number
  perDay: number
  perMonth: number
  perYear: number
}

/**
 * What the expression costs, counted over a 366-day window instead of guessed
 * from the field lengths: a day that cannot fire contributes nothing however
 * many hours its hour field lists.
 */
export function describeFrequency(fields: Record<CronFieldId, number[]>): CronFrequency {
  const perMatchingDay = fields.second.length * fields.minute.length * fields.hour.length
  const probe = new Date(2025, 0, 1)
  let matchingDays = 0
  for (let day = 0; day < 366; day += 1) {
    if (matchesDay(fields, probe)) matchingDays += 1
    probe.setDate(probe.getDate() + 1)
  }
  const perYear = matchingDays * perMatchingDay
  return {
    perMatchingDay,
    matchingDays,
    perDay: perYear / 366,
    perMonth: perYear / 12,
    perYear
  }
}
