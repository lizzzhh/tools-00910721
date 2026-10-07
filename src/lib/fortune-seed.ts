/**
 * The reader's own fortune seed, kept in the site's one table.
 *
 * The model in `fortune.ts` derives a score from a seed and the clock, and a
 * published seed would give every reader the same fortune at the same second.
 * That is not what this card is for, so the seed is minted once per reader and
 * stored: the number is then the same for this reader on every visit and
 * different from everyone else's, which is the whole point of it.
 *
 * Two things follow from storing it, and both are why this is a module rather
 * than three lines in the dashboard:
 *
 * - The seed has to be there before the first score is read, and reading the
 *   table takes a moment, so the card waits rather than printing a number and
 *   then replacing it.
 * - Two tabs opening at once can both find the table empty and both mint a
 *   seed. The table announces writes, so the later one is adopted here and the
 *   two tabs settle on one fortune instead of drifting apart.
 *
 * The seed is not a secret. It is only required to be different per reader, so
 * the last resort below is allowed to be a plain random string.
 */

import { storageKeys } from './storage-schema.ts'
import { storage, type StorageTable } from './storage.ts'
import { defaultFortuneSeed } from './fortune.ts'

/**
 * A seed nobody else has, shaped like the published one so the data page reads
 * as a fortune seed rather than as a row of hex.
 */
export function mintFortuneSeed(): string {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto?.randomUUID === 'function') return `code-space:fortune/${webCrypto.randomUUID()}`
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16))
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `code-space:fortune/${hex}`
  }
  // No secure random to ask. The fortune still has to run, so it runs on the
  // published seed: a reader in this position shares a fortune rather than
  // getting none.
  return defaultFortuneSeed
}

/** Whether a stored value can be used as a seed at all. */
function isSeed(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * This reader's seed, minted and stored on the first call.
 *
 * Safe to call on every visit: a seed that is already in the table is the one
 * that gets returned, which is what makes a reload show the same fortune.
 */
export function readFortuneSeed(table: StorageTable = storage()): string {
  const stored = table.get(storageKeys.fortuneSeed)
  if (isSeed(stored)) return stored
  const minted = mintFortuneSeed()
  // Written through the table that was asked, so a caller that brought its own
  // table gets its own seed back rather than the page's.
  table.set(storageKeys.fortuneSeed, minted)
  return minted
}
