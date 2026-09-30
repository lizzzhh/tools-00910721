/**
 * The site's one storage table, in IndexedDB.
 *
 * Everything the site remembers used to be scattered across localStorage and
 * sessionStorage. It now lives in a single key/value table, which is what makes
 * one backup file enough to move a whole profile between browsers.
 *
 * Three problems come with an async store, and each has an answer here:
 *
 * - Code wants to read a value while it is drawing. The table is therefore read
 *   into memory on boot and every read is served from that snapshot; writes go
 *   to the snapshot first and are flushed to the database a moment later.
 * - Another tab used to hear about a write through the storage event, which
 *   IndexedDB has no equivalent of. Writes are announced on a BroadcastChannel
 *   instead, so a second tab sees the same words a moment later.
 * - The theme and the language have to be known before the first paint, and
 *   neither the module system nor IndexedDB can answer that in time. Those two
 *   values are mirrored into a cookie, which the inline scripts in `<head>` read
 *   synchronously; the table stays the source of truth and rewrites the mirror
 *   whenever the two disagree.
 */

import {
  buildBackup,
  mirroredKeys,
  parseBackup,
  planMigration,
  scratchpadViewKey,
  storageChannelName,
  storageDbName,
  storageDbVersion,
  storageKeys,
  storageStoreName,
  type StorageEntries
} from './storage-schema.ts'

/** How long writes may pile up before they are sent to the database. */
const flushDelay = 120

export type StorageListener = (key: string, value: string | undefined) => void

/** The database side of the table, behind an interface so tests can fake it. */
export interface StorageBackend {
  readAll(): Promise<Array<[string, string]>>
  write(entries: Array<[string, string]>): Promise<void>
  remove(keys: string[]): Promise<void>
}

/**
 * The cross-tab side, also behind an interface because tests have no channels.
 * An empty value means the key is gone, which is how a deletion is announced.
 */
export interface StorageBus {
  post(entries: StorageEntries): void
  listen(handler: (entries: StorageEntries) => void): void
}

export type StorageTableOptions = {
  backend: StorageBackend
  bus?: StorageBus
  /** Everything the site left behind in the old localStorage and sessionStorage. */
  legacy?: () => StorageEntries
  /** Called with the entries that were carried over, so the old store can drop them. */
  retire?: (entries: StorageEntries) => void
  /** Called whenever a mirrored value changes, to refresh the cookie copy. */
  mirror?: (entries: StorageEntries) => void
  /** Called when a batch could not reach the database, with the keys it carried. */
  onWriteError?: (keys: string[], error: unknown) => void
}

/**
 * A key/value table with an in-memory snapshot. Reads are synchronous, writes
 * are batched, and a change made in another tab arrives through the bus.
 */
export class StorageTable {
  readonly ready: Promise<void>

  private entries = new Map<string, string>()
  private listeners = new Set<StorageListener>()
  private queue = new Map<string, string | undefined>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly options: StorageTableOptions

  constructor(options: StorageTableOptions) {
    this.options = options
    this.ready = this.hydrate()
  }

  private async hydrate() {
    let rows: Array<[string, string]> = []
    try {
      rows = await this.options.backend.readAll()
    } catch {
      // A database that will not open is a site that still has to work: the
      // snapshot starts empty and every write is attempted again.
      rows = []
    }
    for (const [key, value] of rows) this.entries.set(key, value)

    const migrated = planMigration({ local: this.options.legacy?.() }, Object.fromEntries(this.entries))
    if (Object.keys(migrated).length > 0) {
      for (const [key, value] of Object.entries(migrated)) {
        this.entries.set(key, value)
        this.queue.set(key, value)
      }
      await this.drain()
      this.options.retire?.(migrated)
    }
    this.options.mirror?.(Object.fromEntries(this.entries))

    this.options.bus?.listen((incoming) => {
      const touched: string[] = []
      for (const [key, value] of Object.entries(incoming)) {
        if (this.entries.get(key) === value) continue
        if (value === '') this.entries.delete(key)
        else this.entries.set(key, value)
        touched.push(key)
        this.emit(key, value === '' ? undefined : value)
      }
      if (touched.length === 0) return
      this.options.mirror?.(Object.fromEntries(this.entries))
      this.emit('*', undefined)
    })
  }

  private emit(key: string, value: string | undefined) {
    for (const listener of this.listeners) listener(key, value)
  }

  get(key: string): string | undefined {
    return this.entries.get(key)
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  set(key: string, value: string) {
    if (this.entries.get(key) === value) return
    this.entries.set(key, value)
    this.queue.set(key, value)
    this.schedule()
    this.options.bus?.post({ [key]: value })
    this.options.mirror?.({ [key]: value })
    this.emit(key, value)
  }

  remove(key: string) {
    if (!this.entries.has(key)) return
    this.entries.delete(key)
    this.queue.set(key, undefined)
    this.schedule()
    this.options.bus?.post({ [key]: '' })
    this.options.mirror?.({ [key]: '' })
    this.emit(key, undefined)
  }

  /** The whole snapshot, which is what the data page lists and exports. */
  snapshot(): StorageEntries {
    return Object.fromEntries(this.entries)
  }

  subscribe(listener: StorageListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Waits for every queued write to reach the database. */
  async flush() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    await this.drain()
  }

  private schedule() {
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.drain()
    }, flushDelay)
  }

  private async drain() {
    if (this.queue.size === 0) return
    const batch = new Map(this.queue)
    this.queue.clear()
    const writes: Array<[string, string]> = []
    const removals: string[] = []
    for (const [key, value] of batch) {
      if (value === undefined) removals.push(key)
      else writes.push([key, value])
    }
    try {
      await this.options.backend.write(writes)
      await this.options.backend.remove(removals)
    } catch (error) {
      // Throwing here would break the feature that asked for the write, so the
      // batch goes back on the queue to be tried again by the next write. Only
      // one pending attempt per key is kept, so a store that stays full costs a
      // map entry per key rather than growing without end.
      for (const [key, value] of batch) {
        if (!this.queue.has(key)) this.queue.set(key, value)
      }
      this.options.onWriteError?.([...batch.keys()], error)
    }
  }

  /** A backup of the whole table as a JSON document. */
  async export(): Promise<string> {
    await this.flush()
    return buildBackup(this.snapshot(), new Date().toISOString())
  }

  /**
   * Merges a backup into the table. Merging rather than replacing means an
   * import can add a key without taking away what this browser already had.
   */
  async import(raw: string): Promise<number> {
    const entries = parseBackup(raw)
    if (!entries) throw new Error('unreadable backup')
    for (const [key, value] of Object.entries(entries)) this.set(key, value)
    await this.flush()
    return Object.keys(entries).length
  }

  /** Empties the table, which is what the data page offers as a reset. */
  async clear(): Promise<void> {
    const keys = [...this.entries.keys()]
    this.entries.clear()
    this.queue.clear()
    try {
      await this.options.backend.remove(keys)
    } catch {}
    this.options.bus?.post(Object.fromEntries(keys.map((key) => [key, ''])))
    this.options.mirror?.(Object.fromEntries(keys.map((key) => [key, ''])))
    this.emit('*', undefined)
  }
}

/* ------------------------------------------------------------------- IndexedDB */

/**
 * One object store with out-of-line string keys, the same shape the localStorage
 * table had, so nothing above this line has to know the difference.
 */
export function createIdbBackend(name = storageDbName, version = storageDbVersion): StorageBackend {
  let handle: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> => {
    if (!handle) {
      handle = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, version)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(storageStoreName)) db.createObjectStore(storageStoreName)
        }
        request.onsuccess = () => {
          const db = request.result
          // Another tab opening a newer build closes this connection under us,
          // and a connection that is already closed rejects every transaction
          // with InvalidStateError. Handing it back instead would turn one tab's
          // upgrade into this tab losing its writes, so the handle is dropped and
          // the next call opens the new database.
          db.onversionchange = () => {
            db.close()
            handle = null
          }
          db.onclose = () => {
            handle = null
          }
          resolve(db)
        }
        request.onerror = () => reject(request.error ?? new Error('indexeddb could not be opened'))
        request.onblocked = () => reject(new Error('indexeddb is blocked by another tab'))
      })
      // A failed open must not be remembered, or the site would never retry.
      handle.catch(() => {
        handle = null
      })
    }
    return handle
  }

  const write = async (mode: IDBTransactionMode, body: (store: IDBObjectStore) => void) => {
    const db = await open()
    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction
      try {
        tx = db.transaction(storageStoreName, mode)
        body(tx.objectStore(storageStoreName))
      } catch (error) {
        // A connection closed between the open and the transaction throws here
        // rather than rejecting later, and the handle it belonged to is dead.
        handle = null
        reject(error)
        return
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'))
    })
  }

  return {
    async readAll() {
      const db = await open()
      const rows: Array<[string, string]> = []
      return new Promise<Array<[string, string]>>((resolve, reject) => {
        let tx: IDBTransaction
        try {
          tx = db.transaction(storageStoreName, 'readonly')
        } catch (error) {
          handle = null
          reject(error)
          return
        }
        const request = tx.objectStore(storageStoreName).openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            resolve(rows)
            return
          }
          rows.push([String(cursor.key), String(cursor.value)])
          cursor.continue()
        }
        request.onerror = () => reject(request.error ?? new Error('indexeddb cursor failed'))
      })
    },
    write(entries) {
      if (entries.length === 0) return Promise.resolve()
      return write('readwrite', (store) => {
        for (const [key, value] of entries) store.put(value, key)
      })
    },
    remove(keys) {
      if (keys.length === 0) return Promise.resolve()
      return write('readwrite', (store) => {
        for (const key of keys) store.delete(key)
      })
    }
  }
}

/** Announces writes to the other tabs, the way the storage event used to. */
export function createChannelBus(name = storageChannelName): StorageBus {
  if (typeof BroadcastChannel === 'undefined') return { post: () => {}, listen: () => {} }
  const handlers = new Set<(entries: StorageEntries) => void>()
  const channel = new BroadcastChannel(name)
  channel.onmessage = (event: MessageEvent<StorageEntries>) => {
    if (!event.data || typeof event.data !== 'object') return
    for (const handler of handlers) handler(event.data)
  }
  return {
    post(entries) {
      channel.postMessage(entries)
    },
    listen(handler) {
      handlers.add(handler)
    }
  }
}

/* --------------------------------------------------------------------- mirror */

const cookieName = (key: string) => `cs-${key}`

function readCookie(key: string): string | undefined {
  const name = `${cookieName(key)}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(name)) return decodeURIComponent(trimmed.slice(name.length))
  }
  return undefined
}

function writeCookie(key: string, value: string) {
  if (value === '') {
    document.cookie = `${cookieName(key)}=; path=/; max-age=0; samesite=lax`
    return
  }
  document.cookie = `${cookieName(key)}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Keeps the two values the `<head>` scripts need in a cookie. The table decides
 * what they are; the cookie only has to be readable before the first paint.
 */
function createMirror() {
  return (entries: StorageEntries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (!mirroredKeys.includes(key)) continue
      if (readCookie(key) === value) continue
      writeCookie(key, value)
    }
  }
}

/* ------------------------------------------------------------------ migration */

/** Everything in the old localStorage, site keys or not. */
function readLegacyLocal(): StorageEntries {
  const entries: StorageEntries = {}
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key === null) continue
      const value = localStorage.getItem(key)
      if (value !== null) entries[key] = value
    }
  } catch {
    return {}
  }
  return entries
}

/**
 * The old per-tab layout record, which was a session key rather than a local one.
 * It is put under this tab's own key on the way in, because that is where the
 * table keeps it now.
 */
function readLegacySession(): StorageEntries {
  try {
    const view = sessionStorage.getItem(storageKeys.scratchpadView)
    return view ? { [viewStorageKey()]: view } : {}
  } catch {
    return {}
  }
}

/** Drops what has been carried over, so the next visit does not carry it again. */
function retireLegacy(entries: StorageEntries) {
  try {
    for (const key of Object.keys(entries)) localStorage.removeItem(key)
  } catch {}
  try {
    sessionStorage.removeItem('code-space-scratchpad-view')
    sessionStorage.removeItem('code-space-tool-switch-scroll')
  } catch {}
}

/** A tab needs an identity of its own, and only this tab may know it. */
function readTabId(): string {
  const key = 'code-space-tab-id'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return 'shared'
  }
}

let tabId: string | null = null

/**
 * The id of this tab. The layout of the notes is keyed by it, so every tab lays
 * the same notes out for itself while the words themselves stay shared.
 */
export function currentTabId(): string {
  if (tabId === null) tabId = readTabId()
  return tabId
}

/** The per-tab layout record for the scratchpads. */
export function viewStorageKey(): string {
  return scratchpadViewKey(currentTabId())
}

let table: StorageTable | null = null

/**
 * The table for this page, created on first use. A second snapshot would not
 * hear about the writes of the first, so there is only ever one.
 */
export function storage(): StorageTable {
  if (!table) {
    table = new StorageTable({
      backend: createIdbBackend(),
      bus: createChannelBus(),
      legacy: () => ({ ...readLegacyLocal(), ...readLegacySession() }),
      retire: retireLegacy,
      mirror: createMirror(),
      // A store that will not take a write has to be said out loud: the snapshot
      // still reads back what the page just saved, and only a reload reveals that
      // it was never stored at all.
      onWriteError: (keys, error) => console.error('storage could not save', keys, error)
    })
    // A tab on its way out still has to hand its writes over.
    addEventListener('pagehide', () => void table?.flush())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void table?.flush()
    })
  }
  return table
}

/** Reads a value, served from the snapshot that boot filled in. */
export function readValue(key: string): string | undefined {
  return storage().get(key)
}

/**
 * Runs a callback once the snapshot is full. Anything that reads a stored value
 * while the page is being built would otherwise read an empty table, because
 * opening the database takes a moment and nothing else on the page waits for it.
 *
 * A reader that throws, or that comes back as a rejected promise, is reported
 * and dropped: the other readers still paint, and nothing escapes as an unhandled
 * rejection that says nothing about which panel it came from.
 */
export function whenStorageReady(run: () => void) {
  storage().ready.then(
    () => runReader(run),
    () => runReader(run)
  )
}

function runReader(run: () => void) {
  try {
    const result = run() as unknown
    if (result instanceof Promise) void result.catch(reportFailure)
  } catch (error) {
    reportFailure(error)
  }
}

function reportFailure(error: unknown) {
  console.error('a stored value could not be read back', error)
}

/** Writes a value to the snapshot and queues it for the database. */
export function writeValue(key: string, value: string) {
  storage().set(key, value)
}
