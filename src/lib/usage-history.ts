/**
 * The record of what was used and exactly when. Every run of a tool appends one
 * event, and everything the dashboard shows about time — today's count, the
 * per-day curve, the recent list — is read back out of that log rather than
 * kept as a second tally that could drift from it.
 *
 * Pure on purpose: the storage table is the only thing that cannot be checked
 * in node, so the rules about what a valid event is live here.
 */

import { dayKey, pruneDaySeries, type DaySeries } from './day-series.ts'

/** One run: which tool, and the instant it happened. */
export type UsageEvent = { id: string; at: string }

/**
 * How many runs to keep. Long enough for weeks of ordinary use and for the
 * curve to be rebuilt later, short enough that one table row stays a readable
 * size in the browser. The lifetime totals are counted separately and are not
 * affected when the log is trimmed.
 */
export const usageLogLimit = 1000

/** How many days of per-day counts the dashboard keeps, older days fall off. */
export const usageDayHistory = 90

const recentLimit = 6

/**
 * Keeps the events that really are runs of a tool: a tool id and a moment that
 * parses. Anything else came from a hand-edited backup and is dropped rather
 * than drawn. The result is oldest first, so a log merged in out of order still
 * reads as a log.
 */
export function readEvents(value: unknown): UsageEvent[] {
  if (!Array.isArray(value)) return []
  const events: UsageEvent[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const { id, at } = entry as Partial<UsageEvent>
    if (typeof id !== 'string' || !id) continue
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    events.push({ id, at })
  }
  return events.sort((first, second) => Date.parse(first.at) - Date.parse(second.at))
}

/** Appends a run and drops the oldest ones once the log is full. */
export function appendEvent(events: UsageEvent[], event: UsageEvent, limit = usageLogLimit): UsageEvent[] {
  return [...events, event].slice(-Math.max(Math.trunc(limit) || 0, 1))
}

/**
 * Runs per calendar day, in the reader's own time zone, which is the zone the
 * day keys everywhere else in the site are written in.
 */
export function dayCounts(events: UsageEvent[], keepDays = usageDayHistory): DaySeries {
  const counts: DaySeries = {}
  let day = ''
  for (const event of events) {
    const key = dayKey(new Date(event.at))
    if (key !== day) day = key
    counts[day] = (counts[day] ?? 0) + 1
  }
  return pruneDaySeries(counts, keepDays)
}

/** The latest run of each tool, newest first, so one tool cannot fill the list. */
export function latestByTool(events: UsageEvent[], limit = recentLimit): UsageEvent[] {
  const seen = new Set<string>()
  const recent: UsageEvent[] = []
  for (let index = events.length - 1; index >= 0 && recent.length < Math.max(limit, 0); index -= 1) {
    const event = events[index]
    if (seen.has(event.id)) continue
    seen.add(event.id)
    recent.push(event)
  }
  return recent
}
