import { readValue, writeValue } from '../lib/storage'
import { storageKeys } from '../lib/storage-schema'
import { todayKey, type DaySeries } from '../lib/day-series'
import {
  appendEvent,
  dayCounts,
  latestByTool,
  readEvents,
  type UsageEvent
} from '../lib/usage-history'

export type { UsageEvent } from '../lib/usage-history'

/**
 * What the dashboard shows. `total` and `byTool` count every run ever, so they
 * do not shrink when the log is trimmed; everything that is about time is read
 * out of `log`.
 */
export type UsageSnapshot = {
  total: number
  today: number
  byTool: Record<string, number>
  /** The last tools used, newest first, one entry per tool. */
  recent: UsageEvent[]
  /** Runs per calendar day, for the day axis. A day with no runs is absent. */
  daily: DaySeries
  /** Every recorded run, oldest first. */
  log: UsageEvent[]
}

type StoredUsage = {
  total: number
  byTool: Record<string, number>
  log: UsageEvent[]
}

const storageKey = storageKeys.usage

const emptyUsage = (): StoredUsage => ({ total: 0, byTool: {}, log: [] })

function readUsage(): StoredUsage {
  try {
    const stored = JSON.parse(readValue(storageKey) ?? '{}') as Partial<StoredUsage> & { recent?: unknown }
    return {
      total: Number(stored.total) || 0,
      byTool: stored.byTool && typeof stored.byTool === 'object' ? stored.byTool : {},
      // Records written before the log existed kept only the last few runs, and
      // those are the only ones that can be brought over.
      log: readEvents(stored.log ?? stored.recent)
    }
  } catch {
    return emptyUsage()
  }
}

function writeUsage(usage: StoredUsage) {
  writeValue(storageKey, JSON.stringify(usage))
}

/** Records one run of a tool, with the moment it happened. */
export function recordToolUsage(toolId: string) {
  const usage = readUsage()
  usage.total += 1
  usage.byTool[toolId] = (usage.byTool[toolId] ?? 0) + 1
  usage.log = appendEvent(usage.log, { id: toolId, at: new Date().toISOString() })
  writeUsage(usage)
}

export function getUsageSnapshot(): UsageSnapshot {
  const { total, byTool, log } = readUsage()
  const daily = dayCounts(log)
  return {
    total,
    today: daily[todayKey()] ?? 0,
    byTool,
    recent: latestByTool(log),
    daily,
    log
  }
}
