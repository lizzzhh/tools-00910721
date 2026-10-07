import { strict as assert } from 'node:assert'
import test from 'node:test'
import { StorageTable } from '../src/lib/storage.ts'
import { storageKeys } from '../src/lib/storage-schema.ts'
import { mintFortuneSeed, readFortuneSeed } from '../src/lib/fortune-seed.ts'
import { defaultFortuneSeed, fortuneAt } from '../src/lib/fortune.ts'

/** A database in a Map, so the seed can be exercised without a browser. */
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

const IN_2026 = Date.UTC(2026, 8, 27, 12, 0, 0)

test('a minted seed is shaped like a seed and is not the published one', () => {
  const seed = mintFortuneSeed()
  assert.match(seed, /^code-space:fortune\/\S+$/)
  assert.notEqual(seed, defaultFortuneSeed, 'every reader would share a fortune')
})

test('two mints are two seeds', () => {
  const minted = new Set(Array.from({ length: 200 }, () => mintFortuneSeed()))
  // A hundred and ninety-nine is enough to catch a seed that is a constant, or
  // one that fell back to the same value twice in a row.
  assert.ok(minted.size >= 199, `${minted.size} seeds came out of 200 mints`)
})

test('a seed with no secure random to ask still runs on a fortune', () => {
  const real = globalThis.crypto
  // A browser old enough to have neither is rare, and a card that throws here
  // would take the whole dashboard with it.
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
  try {
    assert.equal(mintFortuneSeed(), defaultFortuneSeed)
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true })
  }
})

test('a reader is given a seed on the first visit and keeps it after that', async () => {
  const backend = memoryBackend()
  const table = new StorageTable({ backend })
  await table.ready

  const first = readFortuneSeed(table)
  assert.match(first, /^code-space:fortune\//)
  await table.flush()
  assert.equal(backend.entries.get(storageKeys.fortuneSeed), first, 'the seed did not reach the database')

  // A reload opens a new table over the same database, and has to find the seed
  // rather than mint a second one: a reader who came back to a different fortune
  // would be reading somebody else's card.
  const reloaded = new StorageTable({ backend })
  await reloaded.ready
  assert.equal(readFortuneSeed(reloaded), first)
  assert.equal(backend.entries.get(storageKeys.fortuneSeed), first)
})

test('two tabs of one reader are given one seed, and told when it changes', async () => {
  const backend = memoryBackend()
  const bus = loopbackBus()
  const first = new StorageTable({ backend, bus })
  await first.ready
  const second = new StorageTable({ backend, bus })
  await second.ready

  const adopted = []
  second.subscribe((key, value) => {
    if (key === storageKeys.fortuneSeed && value) adopted.push(value)
  })

  // The write is announced the moment it is made, so a tab that is still booting
  // hears the seed rather than minting one of its own.
  const mine = readFortuneSeed(first)
  assert.deepEqual(adopted, [mine])
  await first.flush()
  assert.equal(readFortuneSeed(second), mine, 'the second tab minted a seed of its own')

  // And a seed that changes under a running tab is adopted, not ignored.
  const changed = mintFortuneSeed()
  first.set(storageKeys.fortuneSeed, changed)
  assert.deepEqual(adopted, [mine, changed])
  assert.equal(readFortuneSeed(second), changed)
})

test('a seed that cannot be used is replaced rather than shown', async () => {
  const backend = memoryBackend()
  const table = new StorageTable({ backend })
  await table.ready

  // A hand-edited backup, or a key that arrived empty from a clear.
  table.set(storageKeys.fortuneSeed, '')
  const seed = readFortuneSeed(table)
  assert.match(seed, /^code-space:fortune\//)
  assert.equal(table.get(storageKeys.fortuneSeed), seed)
})

test('two readers with two seeds see two different fortunes', async () => {
  // The point of storing a seed: the model is unchanged, and the two numbers are
  // different anyway.
  const backend = memoryBackend()
  const mine = new StorageTable({ backend })
  const yours = new StorageTable({ backend: memoryBackend() })
  await Promise.all([mine.ready, yours.ready])
  const mySeed = readFortuneSeed(mine)
  const yourSeed = readFortuneSeed(yours)
  assert.notEqual(mySeed, yourSeed)
  assert.notEqual(fortuneAt(IN_2026, { seed: mySeed }), fortuneAt(IN_2026, { seed: yourSeed }))
})
