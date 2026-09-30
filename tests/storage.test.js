import { strict as assert } from 'node:assert'
import test from 'node:test'
import { StorageTable } from '../src/lib/storage.ts'
import { buildBackup, planMigration, parseBackup, scratchpadViewKey, storageKeys } from '../src/lib/storage-schema.ts'

/** A database in a Map, so the table can be exercised without a browser. */
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

/** A bus that hands every message straight to whoever is listening. */
const loopbackBus = () => {
  const handlers = new Set()
  const sent = []
  return {
    sent,
    post(entries) {
      sent.push(entries)
      for (const handler of handlers) handler(entries)
    },
    listen(handler) {
      handlers.add(handler)
    }
  }
}

test('a value written here reaches the database and reads back', async () => {
  const backend = memoryBackend()
  const table = new StorageTable({ backend })
  await table.ready

  table.set(storageKeys.theme, 'dark')
  await table.flush()

  assert.equal(table.get(storageKeys.theme), 'dark')
  assert.equal(backend.entries.get(storageKeys.theme), 'dark')
})

test('a value that already reads the same is not written twice', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const table = new StorageTable({ backend, bus })
  await table.ready

  table.set(storageKeys.theme, 'dark')
  table.set(storageKeys.theme, 'dark')

  assert.equal(bus.sent.length, 1)
})

test('what was in the old store is carried over, and only what was missing', async () => {
  const backend = memoryBackend()
  const table = new StorageTable({
    backend,
    legacy: () => ({ [storageKeys.theme]: 'dark', [storageKeys.favorites]: '["hash"]' })
  })
  await table.ready

  assert.equal(table.get(storageKeys.theme), 'dark')
  assert.equal(table.get(storageKeys.favorites), '["hash"]')
  assert.equal(backend.entries.get(storageKeys.favorites), '["hash"]')
})

test('a value already in the table is not overwritten by the old store', () => {
  const migrated = planMigration(
    { local: { [storageKeys.locale]: 'ja' } },
    { [storageKeys.locale]: 'en' }
  )
  assert.deepEqual(migrated, {})
})

test('a store that refuses a write is reported, and the value is tried again', async () => {
  let refuse = true
  const entries = new Map()
  const failed = []
  const table = new StorageTable({
    backend: {
      async readAll() {
        return []
      },
      async write(rows) {
        if (refuse) throw new Error('quota exceeded')
        for (const [key, value] of rows) entries.set(key, value)
      },
      async remove() {}
    },
    onWriteError: (keys) => failed.push(keys)
  })
  await table.ready

  table.set(storageKeys.theme, 'dark')
  await table.flush()
  assert.deepEqual(failed, [[storageKeys.theme]])
  assert.equal(entries.has(storageKeys.theme), false)

  // The batch is still queued, so the next write carries it again rather than
  // the value being lost with nothing left to retry.
  refuse = false
  table.set(storageKeys.locale, 'ja')
  await table.flush()
  assert.equal(entries.get(storageKeys.theme), 'dark')
  assert.equal(entries.get(storageKeys.locale), 'ja')
})

test('a write from another tab arrives, and so does a deletion', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const table = new StorageTable({ backend, bus })
  await table.ready
  const seen = []
  table.subscribe((key, value) => seen.push([key, value]))

  const other = new StorageTable({ backend: memoryBackend(), bus })
  await other.ready
  other.set(storageKeys.favorites, '["hash"]')
  other.remove(storageKeys.favorites)

  assert.equal(table.get(storageKeys.favorites), undefined)
  assert.ok(seen.some(([key, value]) => key === storageKeys.favorites && value === '["hash"]'))
  assert.ok(seen.some(([key, value]) => key === storageKeys.favorites && value === undefined))
})

test('every tab lays the notes out for itself', () => {
  assert.equal(scratchpadViewKey('abc'), 'code-space-scratchpad-view:abc')
  assert.notEqual(scratchpadViewKey('abc'), scratchpadViewKey('def'))
})

test('a backup comes back out of an import unchanged', async () => {
  const table = new StorageTable({ backend: memoryBackend() })
  await table.ready
  const backup = buildBackup({ [storageKeys.usage]: '{"total":3}' }, '2026-09-27T00:00:00.000Z')

  const count = await table.import(backup)
  const exported = JSON.parse(await table.export())

  assert.equal(count, 1)
  assert.equal(exported.entries[storageKeys.usage], '{"total":3}')
})

test('an import merges rather than replaces', async () => {
  const table = new StorageTable({ backend: memoryBackend() })
  await table.ready
  table.set(storageKeys.theme, 'dark')

  await table.import(buildBackup({ [storageKeys.favorites]: '["hash"]' }, '2026-09-27T00:00:00.000Z'))

  assert.equal(table.get(storageKeys.theme), 'dark')
  assert.equal(table.get(storageKeys.favorites), '["hash"]')
})

test('a file that is not a backup is refused', () => {
  assert.equal(parseBackup('not json'), null)
  assert.equal(parseBackup(JSON.stringify({ app: 'other', version: 1, entries: {} })), null)
  assert.equal(parseBackup(JSON.stringify({ app: 'code-space', version: 99, entries: {} })), null)
  assert.equal(parseBackup(JSON.stringify({ app: 'code-space', version: 1, entries: { a: 1 } })), null)
})

test('an older backup is still welcome', () => {
  assert.equal(parseBackup(JSON.stringify({ app: 'code-space', version: 0, entries: { a: 'b' } }))?.a, 'b')
})

test('clearing takes everything with it', async () => {
  const backend = memoryBackend()
  const table = new StorageTable({ backend })
  await table.ready
  table.set(storageKeys.usage, '{"total":1}')
  table.set(storageKeys.theme, 'light')
  await table.flush()

  await table.clear()

  assert.equal(table.get(storageKeys.usage), undefined)
  assert.equal(backend.entries.size, 0)
})
