/**
 * Whether this reader has opened today's fortune yet.
 *
 * The card is a live number and a live four hour chart, which is exactly the
 * problem: a number that is simply on screen tells nobody anything, because
 * nothing about it took anything to see. So the card is sealed by default and
 * one click a day opens it. The seal is what makes the number worth reading —
 * the reader paid for it, and tomorrow it costs the same.
 *
 * The seal is stored as the reader's own calendar day, `YYYY-MM-DD`, which is
 * the same key `day-series.ts` keys the usage curve by. One key rather than a
 * history, because a day only has to be compared with today: the question is
 * never "which days did this reader open", it is "is the day that was opened
 * still today", and a stale day is simply a sealed card again. That also means
 * an emptied table costs a reader one click rather than their record.
 *
 * Deliberately a *day* and not a duration: a reader who does not open the card
 * for a week comes back to a sealed card, which is the point of the rule, and
 * one who travels across a time zone boundary gets a day by their own clock
 * rather than UTC's, because the day key is built from local date parts.
 *
 * Pure apart from the table, so the rules can be tested in node without a
 * browser.
 */

import { dayKey } from './day-series.ts'
import { storage, type StorageTable } from './storage.ts'
import { storageKeys } from './storage-schema.ts'

/** The shape a stored day has to have to be a day at all. */
const dayPattern = /^\d{4}-\d{2}-\d{2}$/

/** Whether a value can be read as a day. Anything else is a sealed card. */
export function isFortuneDay(value: unknown): value is string {
  return typeof value === 'string' && dayPattern.test(value)
}

/** Today, by the reader's own calendar, which is what the stored key is in. */
export function fortuneToday(now: Date = new Date()): string {
  return dayKey(now)
}

/**
 * Whether the day that was opened is the day the reader is standing in.
 *
 * An unknown, malformed or stale day is sealed rather than open. A clock set
 * backwards lands on a key the table has never heard of, and it should ask for
 * the click rather than hand out a day that has not been earned.
 */
export function isFortuneUnlocked(day: string | undefined, now: Date = new Date()): boolean {
  return isFortuneDay(day) && day === fortuneToday(now)
}

/**
 * The day the reader last opened, read as a day or as nothing.
 *
 * A hand-edited backup or a key that arrived empty from a clear is not a day,
 * and reading it as one would seal nothing.
 */
export function readFortuneDay(table: StorageTable = storage()): string | undefined {
  const stored = table.get(storageKeys.fortuneUnlock)
  return isFortuneDay(stored) ? stored : undefined
}

/** Whether the card on this device is open right now. */
export function isTodayUnlocked(table: StorageTable = storage(), now: Date = new Date()): boolean {
  return isFortuneUnlocked(readFortuneDay(table), now)
}

/**
 * Opens today's fortune and returns the day it settled on.
 *
 * Idempotent within a day, so a second click — a double click, a tab that
 * raced, a click on a card that was already open — writes nothing and announces
 * nothing. The write goes through the table rather than to storage directly, so
 * the other tabs of this reader hear it and seal themselves too.
 */
export function unlockFortune(table: StorageTable = storage(), now: Date = new Date()): string {
  const today = fortuneToday(now)
  if (readFortuneDay(table) === today) return today
  table.set(storageKeys.fortuneUnlock, today)
  return today
}