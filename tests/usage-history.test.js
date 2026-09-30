import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  appendEvent,
  dayCounts,
  latestByTool,
  readEvents,
  usageLogLimit
} from '../src/lib/usage-history.ts'
import { dayKey } from '../src/lib/day-series.ts'

/** A run at a local moment, written the way recordToolUsage writes one. */
const used = (id, text) => ({ id, at: new Date(text).toISOString() })

test('keeps the runs that name a tool and a real moment', () => {
  const events = readEvents([used('json', '2026-09-27T10:00:00'), { id: 'hash', at: 'not a date' }, null, 'json'])

  assert.deepEqual(events, [used('json', '2026-09-27T10:00:00')])
  assert.deepEqual(readEvents([{ at: '2026-09-27T10:00:00Z' }]), [])
  assert.deepEqual(readEvents([{ id: '', at: '2026-09-27T10:00:00Z' }]), [])
  assert.deepEqual(readEvents(undefined), [])
})

test('refuses an id that is not a tool id, whatever a backup claims', () => {
  // The dashboard prints the recent list as markup, and a backup is a file
  // anyone can edit, so an id carrying markup has to be dropped on the way in.
  const hostile = used('<img src=x onerror=alert(1)>', '2026-09-27T10:00:00')
  assert.deepEqual(readEvents([hostile]), [])
  assert.deepEqual(readEvents([used('json-format', '2026-09-27T10:00:00')]), [used('json-format', '2026-09-27T10:00:00')])
})

test('puts a log that arrived out of order back in the order it happened', () => {
  const events = readEvents([used('hash', '2026-09-27T09:00:00'), used('json', '2026-09-25T09:00:00'), used('uuid', '2026-09-26T09:00:00')])

  assert.deepEqual(
    events.map((event) => event.id),
    ['json', 'uuid', 'hash']
  )
})

test('appends a run and drops the oldest once the log is full', () => {
  const events = [used('hash', '2026-09-25T09:00:00'), used('json', '2026-09-26T09:00:00')]

  assert.deepEqual(appendEvent(events, used('uuid', '2026-09-27T09:00:00'), 2), [
    used('json', '2026-09-26T09:00:00'),
    used('uuid', '2026-09-27T09:00:00')
  ])
  assert.deepEqual(appendEvent(events, used('uuid', '2026-09-27T09:00:00'), 0).length, 1)
})

test('counts the runs of each day in the readers own time zone', () => {
  const counts = dayCounts([
    used('json', '2026-09-26T23:50:00'),
    used('hash', '2026-09-27T00:10:00'),
    used('uuid', '2026-09-27T09:00:00'),
    used('text', '2026-09-27T18:00:00')
  ])

  assert.deepEqual(counts, { [dayKey(new Date(2026, 8, 26))]: 1, [dayKey(new Date(2026, 8, 27))]: 3 })
  assert.deepEqual(dayCounts([]), {})
})

test('keeps only the days the window can still draw', () => {
  const events = Array.from({ length: 5 }, (_, offset) => used('json', `2026-09-2${offset + 3}T09:00:00`))

  assert.deepEqual(Object.keys(dayCounts(events, 2)), ['2026-09-26', '2026-09-27'])
})

test('lists the latest run of each tool, newest first and without repeats', () => {
  const recent = latestByTool(
    [
      used('hash', '2026-09-25T09:00:00'),
      used('json', '2026-09-26T09:00:00'),
      used('hash', '2026-09-27T09:00:00'),
      used('uuid', '2026-09-27T10:00:00')
    ],
    6
  )

  assert.deepEqual(recent, [used('uuid', '2026-09-27T10:00:00'), used('hash', '2026-09-27T09:00:00'), used('json', '2026-09-26T09:00:00')])
  assert.equal(latestByTool([], 6).length, 0)
  assert.equal(latestByTool([used('json', '2026-09-27T09:00:00')], 0).length, 0)
})

test('holds enough runs for a long stretch of ordinary use', () => {
  assert.ok(usageLogLimit >= 500, 'a log of 500 runs is about a month of light use')
})
