/**
 * A TRON draw driven by a reproducible random source.
 *
 * The random source is the only input: the same source always yields the same
 * ten mnemonics, the same ten addresses, and the same set of winners. That makes
 * any draw auditable and replayable from its source alone.
 *
 * The random source is therefore not a secret. It is shown, stored, and
 * sufficient to recompute every private key below, so these addresses must never
 * be funded. See the warnings rendered next to the results.
 */
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { entropyToMnemonic, loadWordlist, mnemonicToSeed } from './bip39.ts'
import { deriveChainEntry, getChain } from './index.ts'

/**
 * A draw wins when its 256-bit payout digest falls below this value, which
 * makes the odds exactly `406041315 / 2**256` — one outcome in
 * 285,173,170,708,789,068,480,804,681,190,355,981,024,418,622,685,330,836,443,226,433,763,059.
 * The UI prints its figures from this constant, so the advertised probability and
 * the implemented one cannot drift apart.
 */
export const WIN_THRESHOLD = 406041315n

/** Addresses produced per draw. */
export const ADDRESS_COUNT = 10

const tron = getChain('tron')
const TRON_PATH = tron.defaultPath
const ENTROPY_BYTES = 16

/** `<epoch millis>-<three digits>`, e.g. `1758937200000-427`. */
export type RandomSource = { timestamp: number; digits: number }

export function formatRandomSource({ timestamp, digits }: RandomSource): string {
  return `${timestamp}-${String(digits).padStart(3, '0')}`
}

export function parseRandomSource(text: string): RandomSource | null {
  const match = /^(\d{10,17})-(\d{3})$/.exec(text.trim())
  if (!match) return null
  const timestamp = Number(match[1])
  const digits = Number(match[2])
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null
  if (!Number.isInteger(digits) || digits < 0 || digits > 999) return null
  return { timestamp, digits }
}

/** Three random digits, 0-999 inclusive, each outcome equally likely. */
export function randomDigits(): number {
  const bytes = new Uint8Array(2)
  // 65536 is not a multiple of 1000, so a plain `% 1000` would quietly favour the
  // first 536 outcomes over the rest. Reject the ragged tail instead.
  const limit = Math.floor(65536 / 1000) * 1000
  for (;;) {
    crypto.getRandomValues(bytes)
    const value = (bytes[0] << 8) | bytes[1]
    if (value < limit) return value % 1000
  }
}

export function newRandomSource(now: () => number = Date.now): RandomSource {
  return { timestamp: now(), digits: randomDigits() }
}

export type LotteryEntry = {
  index: number
  mnemonic: string
  address: string
  addressHex: string
  privateKey: string
  winner: boolean
}

/** Domain-separated so the entropy and the payout draw never correlate. */
function keyed(source: string, label: string, index: number): Uint8Array {
  return hmac(sha256, utf8ToBytes(source), utf8ToBytes(`${label}/${index}`))
}

function isWinning(digest: Uint8Array): boolean {
  return BigInt(`0x${bytesToHex(digest)}`) < WIN_THRESHOLD
}

/** Reproduces a draw exactly. Ten addresses, deterministic from the source. */
export async function drawFromSource(source: string): Promise<LotteryEntry[]> {
  const words = await loadWordlist('english')
  const entries: LotteryEntry[] = []

  for (let index = 0; index < ADDRESS_COUNT; index += 1) {
    const entropy = keyed(source, 'entropy', index).slice(0, ENTROPY_BYTES)
    const mnemonic = entropyToMnemonic(entropy, words, ' ')
    const entry = deriveChainEntry(mnemonicToSeed(mnemonic), tron, TRON_PATH, 0)
    const base58 = entry.addresses.find((item) => item.format === 'tron-base58')?.address ?? ''
    const hex = entry.addresses.find((item) => item.format === 'tron-hex')?.address ?? ''
    entries.push({
      index,
      mnemonic,
      address: base58,
      addressHex: hex,
      privateKey: entry.privateKey,
      winner: isWinning(keyed(source, 'payout', index))
    })
  }
  return entries
}

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** `1/2**256` terminates, and it does so after exactly 256 decimal places. */
const DECIMAL_PLACES = 256

export type Odds = { fraction: string; decimal: string; oneIn: string; space: string }

/**
 * The odds as printed in the UI, all of them derived from WIN_THRESHOLD.
 *
 * The decimal expansion is exact rather than rounded: the denominator is a power
 * of two, so `n / 2**256` equals `(n * 5**256) / 10**256` and the expansion
 * terminates after 256 places.
 */
export function odds(): Odds {
  const space = 1n << 256n
  const scaled = (WIN_THRESHOLD * 5n ** BigInt(DECIMAL_PLACES)).toString().padStart(DECIMAL_PLACES, '0')
  return {
    fraction: `${group(WIN_THRESHOLD.toString())} / 2²⁵⁶`,
    decimal: `0.${scaled}`,
    oneIn: group((space / WIN_THRESHOLD).toString()),
    space: group(space.toString())
  }
}

/** A win the user reported from the dialog, with the amount they won. */
export type WinClaim = { index: number; amount: string }

export type HistoryEntry = {
  source: string
  at: number
  winners: number
  claim?: WinClaim
}

/**
 * Ordinary history rows kept before anything is dropped. Winning rows are kept
 * on top of this, so the effective cap is {@link HISTORY_BASE_LIMIT} plus the
 * number of wins rather than a flat number.
 */
export const HISTORY_BASE_LIMIT = 12

/**
 * Trims the history to its cap while never dropping a reported win.
 *
 * A claimed row survives no matter how far it has scrolled towards the end, so
 * the retained length is `HISTORY_BASE_LIMIT + <number of claims>`. Order is
 * preserved, which keeps the newest draw first.
 */
export function trimHistory(rows: readonly HistoryEntry[]): HistoryEntry[] {
  const kept: HistoryEntry[] = []
  let unclaimed = 0
  for (const row of rows) {
    if (row.claim) {
      kept.push(row)
      continue
    }
    if (unclaimed < HISTORY_BASE_LIMIT) {
      kept.push(row)
      unclaimed += 1
    }
  }
  return kept
}

export function tronscanUrl(address: string): string {
  return `https://tronscan.org/#/address/${address}`
}
