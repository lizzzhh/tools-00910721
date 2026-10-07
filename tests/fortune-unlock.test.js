import { strict as assert } from 'node:assert'
import test from 'node:test'
import { StorageTable } from '../src/lib/storage.ts'
import { storageKeys } from '../src/lib/storage-schema.ts'
import { fortuneBarIndexAt } from '../src/lib/fortune.ts'
import { fortuneToday, isFortuneDay, isFortuneUnlocked, isTodayUnlocked, readFortuneDay, unlockFortune } from '../src/lib/fortune-unlock.ts'

/** A database in a Map, so the seal can be exercised without a browser. */
const memoryBackend = () => {
  const entries = new Map()
  return {
    entries,
    async readAll() {
      return [...entries]
    },
    async write(rows) {
      for (const [key, value] of rows) entries.set(key, value)
    },
    async remove(keys) {
      for (const key of keys) entries.delete(key)
    }
  }
}

/** Hands every message straight to whoever is listening, which is what a second tab is. */
const loopbackBus = () => {
  const handlers = new Set()
  return {
    post(entries) {
      for (const handler of handlers) handler(entries)
    },
    listen(handler) {
      handlers.add(handler)
    }
  }
}

/** A reader standing on their own clock rather than on UTC's. */
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

const ready = async (backend, bus) => {
  const table = new StorageTable({ backend, bus })
  await table.ready
  return table
}

test('a reader arrives to a sealed card', async () => {
  const table = await ready(memoryBackend())
  assert.equal(isTodayUnlocked(table, local(2026, 9, 2)), false)
  assert.equal(readFortuneDay(table), undefined)
})

test('one click opens the day, and only that day', async () => {
  const table = await ready(memoryBackend())
  const now = local(2026, 9, 2, 9, 30)

  assert.equal(unlockFortune(table, now), '2026-09-02')
  assert.equal(isTodayUnlocked(table, now), true)

  // Half a day later it is still the day that was opened.
  assert.equal(isTodayUnlocked(table, local(2026, 9, 2, 23, 59)), true)
  // And a minute past midnight it is not.
  assert.equal(isTodayUnlocked(table, local(2026, 9, 3, 0, 1)), false)
})

test('the second click of a day writes nothing and announces nothing', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const table = await ready(backend, bus)
  const announced = []
  table.subscribe((key) => announced.push(key))

  const now = local(2026, 9, 2)
  assert.equal(unlockFortune(table, now), '2026-09-02')
  assert.deepEqual(announced, [storageKeys.fortuneUnlock])

  // A double click, a tab that raced, a click on a card that was already open.
  unlockFortune(table, now)
  unlockFortune(table, local(2026, 9, 2, 22, 0))
  assert.deepEqual(announced, [storageKeys.fortuneUnlock], 'a second click announced a write it did not make')
  await table.flush()
  assert.equal(backend.entries.get(storageKeys.fortuneUnlock), '2026-09-02')
})

test('a new day is a new click, and yesterday does not open it', async () => {
  const table = await ready(memoryBackend())
  const monday = local(2026, 8, 31)
  unlockFortune(table, monday)
  const tuesday = local(2026, 9, 1)

  assert.equal(isTodayUnlocked(table, tuesday), false, 'the card stayed open overnight')
  assert.equal(unlockFortune(table, tuesday), '2026-09-01')
  assert.equal(isTodayUnlocked(table, tuesday), true)
  // Only one key, so the record is the last day opened rather than a history.
  assert.equal(table.snapshot()[storageKeys.fortuneUnlock], '2026-09-01')
})

test('a week away costs a click again rather than nothing', async () => {
  const table = await ready(memoryBackend())
  unlockFortune(table, local(2026, 8, 20))
  // Coming back later is not the same as having been here: the card seals, which
  // is the whole reason the rule is a day and not a timer.
  assert.equal(isTodayUnlocked(table, local(2026, 8, 27)), false)
})

test('a day the reader cannot have earned is sealed, not believed', async () => {
  const now = local(2026, 9, 2)
  for (const value of [undefined, '', '2026-09-02T00:00', '20260902', 'yesterday', '2026-9-2', '9999-99-99']) {
    assert.equal(isFortuneUnlocked(value, now), false, `${JSON.stringify(value)} opened the card`)
  }
  // A clock set backwards lands on a day the table has never heard of.
  assert.equal(isFortuneUnlocked('2026-09-03', now), false)
  assert.equal(isFortuneUnlocked('2026-09-02', now), true)
})

test('a value that is not a day is not read back as one', async () => {
  const table = await ready(memoryBackend())
  // A hand-edited backup, or a key that arrived empty from a clear.
  table.set(storageKeys.fortuneUnlock, 'not a day')
  assert.equal(readFortuneDay(table), undefined)
  assert.equal(isTodayUnlocked(table, local(2026, 9, 2)), false)

  assert.equal(isFortuneDay('2026-09-02'), true)
  assert.equal(isFortuneDay(20260902), false)
  assert.equal(isFortuneDay(null), false)
})

test('the day is the reader\'s own calendar, not UTC\'s', () => {
  // Built from date parts rather than parsed from an offset, so the test says the
  // same thing in every time zone the runner happens to be in.
  assert.equal(fortuneToday(local(2026, 9, 2, 0, 0)), '2026-09-02')
  assert.equal(fortuneToday(local(2026, 9, 2, 23, 59)), '2026-09-02')
  // A month and a year end are not special cases: the key is three padded parts.
  assert.equal(fortuneToday(local(2026, 3, 1)), '2026-03-01')
  assert.equal(fortuneToday(local(2026, 12, 31)), '2026-12-31')
})

test('the seal turns over where the four hour bars do', () => {
  // The bars are cut at the reader's own midnight, and the seal is their day, so
  // the two have to turn over together: a card that re-sealed at UTC's midnight
  // would be asking for a second click eight hours early for a reader east of it.
  const offset = 9 * 3600_000
  const midnight = Date.UTC(2026, 8, 2, 15, 0, 0)
  assert.equal(fortuneBarIndexAt(midnight - 60_000, offset) + 1, fortuneBarIndexAt(midnight, offset))
  assert.equal(fortuneBarIndexAt(midnight + 60_000, offset), fortuneBarIndexAt(midnight, offset))
})

test('one reader opening today tells the reader\'s other tabs', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const first = await ready(backend, bus)
  const second = await ready(backend, bus)

  const heard = []
  second.subscribe((key, value) => {
    if (key === storageKeys.fortuneUnlock) heard.push(value)
  })

  const now = local(2026, 9, 2)
  assert.equal(isTodayUnlocked(second, now), false, 'a tab opened before the click was made')
  const day = unlockFortune(first, now)

  assert.deepEqual(heard, [day], 'the second tab was not told, so it would stay sealed')
  assert.equal(isTodayUnlocked(second, now), true)
  await first.flush()

  // And a tab opened afterwards finds the same day rather than a sealed card.
  const later = await ready(backend, bus)
  assert.equal(isTodayUnlocked(later, now), true)
})

test('clearing the key seals the card again', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const first = await ready(backend, bus)
  const second = await ready(backend, bus)
  const now = local(2026, 9, 2)
  unlockFortune(first, now)

  const heard = []
  second.subscribe((key, value) => {
    if (key === storageKeys.fortuneUnlock) heard.push(value)
  })

  // A cleared key is a day nobody opened, which is a sealed card rather than an
  // open one: unlike the seed, losing this key cannot invent a fortune.
  first.remove(storageKeys.fortuneUnlock)
  assert.deepEqual(heard, [undefined])
  assert.equal(isTodayUnlocked(second, now), false)
})

test('two readers keep two seals', async () => {
  const mine = await ready(memoryBackend())
  const yours = await ready(memoryBackend())
  const now = local(2026, 9, 2)

  unlockFortune(mine, now)
  assert.equal(isTodayUnlocked(mine, now), true)
  assert.equal(isTodayUnlocked(yours, now), false, 'another reader\'s click opened this card')
})