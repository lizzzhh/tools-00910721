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

/**
 * A probability as a percentage in TeX, spelled out while that reads well and in
 * scientific notation once it stops.
 *
 * The advertised odds sit near 3.5e-69, so a fixed expansion would be 66 zeros
 * followed by digits. Below `places` the exponent form is the only readable one,
 * and it keeps the significant figures visible instead of hiding them.
 *
 * The result is TeX rather than finished text, so it must go through
 * {@link renderMath} or {@link renderMathInto}. Callers must not escape it.
 */
export function formatPercent(value: number, places = 4): string {
  const scaled = value * 100
  if (scaled === 0) return '0\\%'
  if (scaled >= 10 ** -places) return `${Number(scaled.toFixed(places))}\\%`
  const exponent = Math.floor(Math.log10(scaled))
  const mantissa = Number((scaled / 10 ** exponent).toFixed(3))
  return `${mantissa}\\times 10^{${exponent}}\\,\\%`
}

/** The advertised per-address probability as a number, for arithmetic. */
export function winProbability(): number {
  return Number(WIN_THRESHOLD) / Number(1n << 256n)
}

export type Odds = { fraction: string; percent: string }

/**
 * The odds as printed in the UI, all of them derived from WIN_THRESHOLD.
 *
 * Both fields are TeX, not finished text. The thousands separators become
 * `{,}` so TeX does not treat them as punctuation and space them out.
 */
export function odds(): Odds {
  const numerator = group(WIN_THRESHOLD.toString()).replace(/,/g, '{,}')
  return {
    fraction: `\\frac{${numerator}}{2^{256}}`,
    percent: formatPercent(winProbability())
  }
}

/**
 * What the streak of misses is counted in: checks opened, or addresses handed
 * out. The same horizon applies to both, so counting in addresses climbs about
 * `ADDRESS_COUNT` times faster per check, which is the whole point of the choice.
 */
export type PosteriorBasis = 'checks' | 'addresses'

export const POSTERIOR_BASISES: readonly PosteriorBasis[] = ['checks', 'addresses']

/**
 * Failures the prior expects, chosen so its mean is exactly the advertised odds.
 *
 * Beta(1, b) has mean 1 / (1 + b), so b = 1/p - 1 makes the prior agree with what
 * the tool publishes. A uniform Beta(1, 1) prior would instead assume the game
 * might pay out half the time, and that assumption is the entire reason a naive
 * version of this calculation reports a comfortable 50%.
 */
function priorFailures(base: number): number {
  return 1 / base - 1
}

/**
 * The chance of at least one win within the next `horizon` trials, given `misses`
 * losses so far.
 *
 * Beta(1, 1/p - 1) updated by `misses` losses is Beta(1, 1/p - 1 + misses), whose
 * predictive chance that the next `horizon` trials all miss is
 * (1/p + misses) / (1/p + misses + horizon). Subtracting from 1 gives the closed
 * form below, so there is no constant to tune.
 *
 * The figure rises with the horizon and shrinks with every extra loss, which is
 * the honest shape: at these odds a losing streak is the expected outcome and
 * carries almost no information, so the estimate barely moves however long the
 * streak runs. Approaching a decent probability would take on the order of 1/p
 * further trials, which is why the number stays near the published odds.
 */
export function posteriorHitProbability(base: number, misses: number, horizon: number): number {
  const b = priorFailures(base)
  return Math.max(0, horizon) / (b + 1 + Math.max(0, misses) + Math.max(0, horizon))
}

/**
 * The misses behind the estimate, given the total in whichever unit was picked.
 *
 * Wins are subtracted in the same unit as the total, and the result is floored at
 * zero because `wins` counts claimed and algorithm wins alike, so it can outrun
 * the tally it is being subtracted from.
 */
export function posteriorStreak(measured: number, wins: number): number {
  return Math.max(0, measured - Math.max(0, wins))
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

/**
 * Whether recording a claim on `row` should also add to the lifetime win tally.
 *
 * A draw carries at most one claim, so claiming the same draw again replaces
 * the earlier claim instead of counting a second win. Without that guard the
 * dialog could be reopened and confirmed over and over to inflate the count.
 */
export function claimCountsAsWin(row: HistoryEntry): boolean {
  return !row.claim
}

export function tronscanUrl(address: string): string {
  return `https://tronscan.org/#/address/${address}`
}
