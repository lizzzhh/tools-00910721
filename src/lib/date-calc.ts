/**
 * Calendar arithmetic for the date calculator.
 *
 * Everything here works on a `{ year, month, day }` triple rather than a `Date`,
 * because a `Date` in the reader's own time zone is exactly the thing that makes
 * date maths wrong: adding 24 hours across a daylight-saving boundary moves the
 * calendar day, not the elapsed time. A triple has no clock in it, so adding a
 * day always means the next day on the calendar.
 *
 * `month` is 1-12, matching how a person writes a date, and out-of-range days
 * are rejected rather than rolled over, so `2025-02-30` is an error instead of
 * quietly becoming March 2nd.
 */

export type Day = { year: number; month: number; day: number }

export type DayErrorCode = 'empty' | 'notADate' | 'outOfRange'

export type DayResult =
  | { ok: true; day: Day }
  | { ok: false; code: DayErrorCode; position?: number }

const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysIn(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return daysInMonth[month - 1]
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The `YYYY-MM-DD` key, which is also the ISO form and the day key used elsewhere. */
export function toKey(day: Day): string {
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`
}

export function toDate(day: Day): Date {
  return new Date(day.year, day.month - 1, day.day)
}

export function fromDate(date: Date): Day {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

export function today(now: Date = new Date()): Day {
  return fromDate(now)
}

/**
 * Reads the date shapes a person actually types: `2025-03-08`, `2025/3/8`,
 * `20250308`, `3/8/2025` and the Chinese `2025年3月8日`. Anything else is
 * reported rather than guessed at, with the position of the offending character
 * so the page can point at it.
 */
export function parseDay(input: string): DayResult {
  const text = input.trim()
  if (!text) return { ok: false, code: 'empty' }

  const cn = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/.exec(text)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const slashed = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text)
  const packed = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)

  // `3/8/2025` is month first, so its groups cannot be handed to `build` in
  // reading order; everything else is year, month, day.
  if (us) return build(Number(us[3]), Number(us[1]), Number(us[2]), us.index)

  const matched = cn ?? iso ?? slashed ?? packed
  if (!matched) {
    const position = /\d/.test(text) ? text.search(/\d/) : 0
    return { ok: false, code: 'notADate', position }
  }
  const [year, month, day] = matched.slice(1).map(Number)
  return build(year, month, day, matched.index)
}

function build(year: number, month: number, day: number, position: number): DayResult {
  if (month < 1 || month > 12) return { ok: false, code: 'outOfRange', position }
  if (day < 1 || day > daysIn(year, month)) return { ok: false, code: 'outOfRange', position }
  return { ok: true, day: { year, month, day } }
}

/** 0 is Sunday, which is what `Date.getDay` reports and what a week table shows. */
export function weekdayOf(day: Day): number {
  return toDate(day).getDay()
}

export function isWeekend(day: Day): boolean {
  const weekday = weekdayOf(day)
  return weekday === 0 || weekday === 6
}

export function addDays(day: Day, amount: number): Day {
  const moved = toDate(day)
  moved.setDate(moved.getDate() + Math.trunc(amount))
  return fromDate(moved)
}

/**
 * Adds months, clamping to the end of the target month: January 31 plus one
 * month is February 28, which is what every calendar on screen does.
 */
export function addMonths(day: Day, amount: number): Day {
  const months = Math.trunc(amount)
  const index = day.year * 12 + (day.month - 1) + months
  const year = Math.floor(index / 12)
  const month = ((index % 12) + 12) % 12 + 1
  return { year, month, day: Math.min(day.day, daysIn(year, month)) }
}

/** Whole calendar days from one day to another, negative when `to` is earlier. */
export function diffDays(from: Day, to: Day): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)
}

/** Whole months between two days, plus the days left over after them. */
export function diffMonths(from: Day, to: Day): { months: number; days: number } {
  const forward = diffDays(from, to) >= 0
  const [start, end] = forward ? [from, to] : [to, from]
  const shifted = addMonths(start, 0)
  let months = (end.year - shifted.year) * 12 + (end.month - shifted.month)
  if (end.day < shifted.day) months -= 1
  const anchor = addMonths(start, months)
  return { months: forward ? months : -months, days: Math.abs(diffDays(anchor, end)) }
}

/** Age at a given day, the way a birth date is reported: full years plus the rest. */
export function age(birth: Day, at: Day): { years: number; months: number; days: number; totalDays: number } {
  const { months, days } = diffMonths(birth, at)
  return { years: Math.trunc(months / 12), months: ((months % 12) + 12) % 12, days, totalDays: diffDays(birth, at) }
}

/**
 * Weekdays in the half-open interval `(from, to]`, which is the interval a
 * project plan means when it asks how many working days a span takes. Starting
 * the count after `from` is what keeps "one day later" at one, and "the same
 * day" at zero, instead of both being one.
 */
export function businessDays(from: Day, to: Day, count = 100_000): number {
  const total = diffDays(from, to)
  if (total === 0) return 0
  const step = total > 0 ? 1 : -1
  const limit = Math.min(Math.abs(total), count)
  let weekdays = 0
  for (let offset = 1; offset <= limit; offset += 1) {
    if (!isWeekend(addDays(from, offset * step))) weekdays += 1
  }
  return weekdays * step
}

/** Weekend days in the same half-open interval, for the complement of `businessDays`. */
export function weekendDays(from: Day, to: Day): number {
  const total = Math.abs(diffDays(from, to))
  return total - Math.abs(businessDays(from, to))
}

/** The ISO 8601 week, which is the only week numbering the whole world agrees on. */
export function isoWeek(day: Day): { year: number; week: number } {
  const date = toDate(day)
  // Thursday of the same week decides which year the week belongs to.
  date.setDate(date.getDate() + 4 - (date.getDay() || 7))
  const year = date.getFullYear()
  const firstThursday = new Date(year, 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 4 - (firstThursday.getDay() || 7))
  const week = Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) + 1
  return { year, week }
}

export function dayOfYear(day: Day): number {
  const start = new Date(day.year, 0, 1)
  return Math.round((toDate(day).getTime() - start.getTime()) / 86_400_000) + 1
}

export const weekDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/**
 * The next `count` dates that fall on a given weekday, so the page can offer
 * "the next three Mondays" without the reader doing the counting.
 */
export function nextWeekdays(day: Day, weekday: number, count: number): Day[] {
  const out: Day[] = []
  let cursor = day
  for (let attempt = 0; attempt < count * 7 + 7 && out.length < count; attempt += 1) {
    cursor = addDays(cursor, 1)
    if (weekdayOf(cursor) === ((weekday % 7) + 7) % 7) out.push(cursor)
  }
  return out
}