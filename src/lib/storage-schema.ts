/**
 * The shape of the site's one storage table, described without touching a
 * browser. Everything the site remembers lives in a single key/value table in
 * IndexedDB, so this file is the map of it: which keys exist, what a backup
 * looks like, and which of them have to be carried over from the localStorage
 * and sessionStorage days.
 *
 * Pure on purpose, so the rules can be tested in node without a database.
 */

/** Database and table names, kept in one place because the export names them. */
export const storageDbName = 'code-space'
export const storageStoreName = 'kv'
export const storageDbVersion = 1

/** Cross-tab channel name. localStorage used to do this job with a storage event. */
export const storageChannelName = 'code-space-storage'

/** Written into every backup so a foreign file is rejected instead of merged. */
export const storageExportApp = 'code-space'
export const storageExportVersion = 1

/** A backup bigger than this is a mistake, and parsing it would only hurt. */
export const storageExportLimit = 4 * 1024 * 1024

export const storageKeys = {
  theme: 'code-space-theme',
  locale: 'code-space-locale',
  usage: 'code-space-usage',
  fortuneSeed: 'code-space-fortune-seed',
  /** The local `YYYY-MM-DD` of the last day the reader opened their fortune. */
  fortuneUnlock: 'code-space-fortune-unlock',
  favorites: 'code-space-favorites',
  scratchpad: 'code-space-scratchpad',
  /** Per tab, so the base key is followed by a tab id: `<key>:<tabId>`. */
  scratchpadView: 'code-space-scratchpad-view',
  lotteryStats: 'tron-lottery:stats',
  lotteryBasis: 'tron-lottery:posterior-basis'
} as const

/**
 * What the market tool remembers, which is a paper account, its trade record and
 * two preferences. The names are kept exactly as they were in the localStorage
 * days, because the migration below carries a reader's account over on the
 * strength of the key it was written under: rename one and the account is lost.
 */
export const marketKeys = {
  account: 'market-account-v1',
  history: 'market-history-v1',
  upColour: 'market-up-colour-v1',
  sizeUnit: 'market-size-unit-v1',
  // The ticket as the reader last had it: the two levels and the margin mode.
  // The chart's period is remembered but where the reader has scrolled to is not,
  // because that is a place rather than a setting.
  orderConfig: 'market-order-config-v1',
  timeframe: 'market-timeframe-v1'
} as const

export type MarketKeyName = keyof typeof marketKeys

export type StorageKeyName = keyof typeof storageKeys

/** Keys whose value is a preference small enough to keep in a cookie mirror. */
export const mirroredKeys: string[] = [storageKeys.theme, storageKeys.locale]

/** The market tool's own keys, listed rather than matched by prefix. */
const ownedMarketKeys: string[] = Object.values(marketKeys)

/** Whether a key belongs to the table rather than to some other extension. */
export function isStorageKey(key: string): boolean {
  return (
    key.startsWith('code-space-') || key.startsWith('tron-lottery:') || ownedMarketKeys.includes(key)
  )
}

/** The per-tab layout record for one tab, which the shared keys never collide with. */
export function scratchpadViewKey(tabId: string): string {
  return `${storageKeys.scratchpadView}:${tabId}`
}

export type StorageEntries = Record<string, string>

export type StorageBackup = {
  app: string
  version: number
  exportedAt: string
  entries: StorageEntries
}

/** Builds the backup document. Keys are sorted so two exports of one state match. */
export function buildBackup(entries: StorageEntries, exportedAt: string): string {
  const sorted: StorageEntries = {}
  for (const key of Object.keys(entries).sort()) sorted[key] = entries[key]
  const backup: StorageBackup = { app: storageExportApp, version: storageExportVersion, exportedAt, entries: sorted }
  return JSON.stringify(backup, null, 2)
}

function readEntries(value: unknown): StorageEntries | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries: StorageEntries = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // The table holds serialised strings and nothing else, so a file carrying
    // anything else is not a backup of this table and is refused whole.
    if (!key || typeof entry !== 'string') return null
    entries[key] = entry
  }
  return entries
}

/**
 * Reads a backup. A file that is not one of ours, or that is too large to be a
 * backup, is refused outright rather than half-imported. An older version is
 * still welcome: only a newer one is refused, so a downgrade cannot read it.
 */
export function parseBackup(raw: string): StorageEntries | null {
  if (!raw || raw.length > storageExportLimit) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const backup = parsed as Partial<StorageBackup>
  if (backup.app !== storageExportApp) return null
  if (!Number.isInteger(backup.version) || (backup.version as number) > storageExportVersion) return null
  return readEntries(backup.entries)
}

/** The legacy layout: everything the table used to keep in localStorage. */
export type LegacyStorage = {
  /**
   * Site keys from the old stores, already carrying their final names. The one
   * session entry is a per-tab layout record, and it is keyed by this tab's id
   * before it gets here, so it migrates like any other key rather than through a
   * rule of its own.
   */
  local?: StorageEntries | null
}

/**
 * What has to move to reach an empty table: any local key the site owns and the
 * table does not have yet. Values already in the table win, so running this twice
 * is harmless.
 */
export function planMigration(legacy: LegacyStorage, current: StorageEntries): StorageEntries {
  const entries: StorageEntries = {}
  for (const [key, value] of Object.entries(legacy.local ?? {})) {
    if (!isStorageKey(key) || typeof value !== 'string' || key in current) continue
    entries[key] = value
  }
  return entries
}
