import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'

/** The four wordlists this tool ships, aligned with the site locales. */
export const bip39Languages = ['english', 'chinese-simplified', 'chinese-traditional', 'japanese'] as const

export type Bip39Language = (typeof bip39Languages)[number]

export const bip39LanguageLabels: Record<Bip39Language, string> = {
  english: 'English',
  'chinese-simplified': '简体中文',
  'chinese-traditional': '繁體中文',
  japanese: '日本語'
}

/**
 * Word separator per language. Japanese conventionally uses the ideographic
 * space, which is what the reference test vectors use. It makes no difference
 * to the seed, because NFKD normalisation folds U+3000 to U+0020.
 */
export const bip39Separators: Record<Bip39Language, string> = {
  english: ' ',
  'chinese-simplified': ' ',
  'chinese-traditional': ' ',
  japanese: '\u3000'
}

/** Entropy sizes BIP39 allows, in bytes, and the word count each one produces. */
export const bip39Strengths = [16, 20, 24, 28, 32] as const

export type Bip39Strength = (typeof bip39Strengths)[number]

export const bip39StrengthBits: Record<Bip39Strength, number> = {
  16: 128,
  20: 160,
  24: 192,
  28: 224,
  32: 256
}

export const bip39WordCounts: Record<Bip39Strength, number> = {
  16: 12,
  20: 15,
  24: 18,
  28: 21,
  32: 24
}

export type Bip39ErrorCode =
  | 'emptyMnemonic'
  | 'wordCountUnsupported'
  | 'unknownWord'
  | 'badChecksum'
  | 'badEntropyLength'
  | 'badEntropyHex'
  | 'entropyTooLarge'
  | 'noSecureRandom'
  | 'languageMismatch'
  | 'badPassphrase'

export class Bip39Error extends Error {
  readonly code: Bip39ErrorCode
  /** Word index the failure refers to, when the failure is word-specific. */
  readonly index?: number
  readonly word?: string

  constructor(code: Bip39ErrorCode, index?: number, word?: string) {
    super(code)
    this.name = 'Bip39Error'
    this.code = code
    this.index = index
    this.word = word
  }
}

const PBKDF2_ROUNDS = 2048
const SEED_LENGTH = 64
/** BIP39 normalises the mnemonic and the passphrase to NFKD before hashing. */
const normalize = (value: string) => value.normalize('NFKD')

/**
 * Wordlists are ~200 KB of text in total, so each one is code-split and only
 * fetched when a mnemonic is actually generated, converted, or validated in
 * that language. The module map keeps the dynamic imports statically analysable.
 */
const loaders: Record<Bip39Language, () => Promise<string[]>> = {
  english: () => import('./wordlists/english.ts').then((module) => module.default),
  'chinese-simplified': () => import('./wordlists/chinese-simplified.ts').then((module) => module.default),
  'chinese-traditional': () => import('./wordlists/chinese-traditional.ts').then((module) => module.default),
  japanese: () => import('./wordlists/japanese.ts').then((module) => module.default)
}

const wordlistCache = new Map<Bip39Language, Promise<string[]>>()

export function isBip39Language(value: string): value is Bip39Language {
  return (bip39Languages as readonly string[]).includes(value)
}

/** Returns the 2048 words of a language, fetching and caching them on first use. */
export function loadWordlist(language: Bip39Language): Promise<string[]> {
  const cached = wordlistCache.get(language)
  if (cached) return cached
  const pending = loaders[language]().then((words) => {
    if (words.length !== 2048) throw new Error(`wordlist ${language} has ${words.length} entries`)
    return words
  })
  wordlistCache.set(language, pending)
  return pending
}

function isStrength(value: number): value is Bip39Strength {
  return (bip39Strengths as readonly number[]).includes(value)
}

export function strengthFromWordCount(count: number): Bip39Strength | null {
  const found = bip39Strengths.find((strength) => bip39WordCounts[strength] === count)
  return found ?? null
}

/**
 * Looks a word up case-insensitively. BIP39 wordlists are lowercase, and the
 * Japanese list is stored in NFKD, so the lookup normalises both sides rather
 * than requiring the caller to.
 */
function indexOfWord(words: string[], word: string): number {
  return words.indexOf(normalize(word.trim().toLowerCase()))
}

/** Splits user input into words, tolerating newlines, tabs and full-width spaces. */
export function splitMnemonic(value: string): string[] {
  return value
    .trim()
    .split(/[\s　]+/u)
    .filter(Boolean)
}

/**
 * Generates cryptographically strong entropy, or throws when the browser has no
 * CSPRNG. Every allowed size is a whole number of 32-bit words, so filling the
 * buffer directly introduces no modulo bias.
 */
export function generateEntropy(strength: Bip39Strength = 32): Uint8Array {
  if (!isStrength(strength)) throw new Bip39Error('badEntropyLength')
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Bip39Error('noSecureRandom')
  return globalThis.crypto.getRandomValues(new Uint8Array(bip39StrengthBits[strength] / 8))
}

/** Turns entropy into a mnemonic. The caller supplies the wordlist to stay synchronous. */
export function entropyToMnemonic(entropy: Uint8Array, words: string[], separator = ' '): string {
  if (entropy.length < 16 || entropy.length > 32 || entropy.length % 4 !== 0) {
    throw new Bip39Error('badEntropyLength')
  }
  const checksumBits = (entropy.length * 8) / 32
  const checksum = sha256(entropy)
  let bits = ''
  for (const byte of entropy) bits += byte.toString(2).padStart(8, '0')
  for (let index = 0; index < checksumBits; index += 1) {
    bits += ((checksum[index >> 3] >> (7 - (index & 7))) & 1).toString()
  }
  const total = bits.length / 11
  const mnemonic: string[] = []
  for (let index = 0; index < total; index += 1) {
    mnemonic.push(words[parseInt(bits.slice(index * 11, index * 11 + 11), 2)])
  }
  return mnemonic.join(separator)
}

export function generateMnemonic(strength: Bip39Strength = 32, words: string[] = [], separator = ' '): string {
  if (words.length !== 2048) throw new Bip39Error('badEntropyLength')
  return entropyToMnemonic(generateEntropy(strength), words, separator)
}

export type MnemonicValidation = {
  valid: boolean
  /** Populated only when `valid` is false. */
  error?: Bip39Error
  words: string[]
  wordCount: number
  /** Entropy in bytes; present only when the mnemonic is valid. */
  entropy?: Uint8Array
  entropyHex?: string
  strength?: Bip39Strength
  /** Word indices, which is what actually encodes the entropy. */
  indices: number[]
}

/**
 * Validates a mnemonic against a wordlist. Never throws for bad user input —
 * an invalid mnemonic is an expected outcome here, not an exceptional one.
 */
export function validateMnemonic(mnemonic: string, words: string[]): MnemonicValidation {
  const parts = splitMnemonic(mnemonic)
  const base = { words: parts, wordCount: parts.length, indices: [] as number[] }
  if (parts.length === 0) return { ...base, valid: false, error: new Bip39Error('emptyMnemonic') }

  const strength = strengthFromWordCount(parts.length)
  if (!strength) return { ...base, valid: false, error: new Bip39Error('wordCountUnsupported') }

  const indices: number[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const position = indexOfWord(words, parts[index])
    if (position < 0) return { ...base, indices, valid: false, error: new Bip39Error('unknownWord', index, parts[index]) }
    indices.push(position)
  }

  const entropyLength = bip39StrengthBits[strength] / 8
  const entropy = new Uint8Array(entropyLength)
  let bits = ''
  for (const position of indices) bits += position.toString(2).padStart(11, '0')
  for (let index = 0; index < entropyLength * 8; index += 1) {
    entropy[index >> 3] |= parseInt(bits[index], 2) << (7 - (index & 7))
  }

  const checksumBits = entropyLength / 4
  const expected = sha256(entropy)
  for (let index = 0; index < checksumBits; index += 1) {
    const actual = (expected[index >> 3] >> (7 - (index & 7))) & 1
    if (actual !== parseInt(bits[entropyLength * 8 + index], 2)) {
      return { ...base, indices, valid: false, error: new Bip39Error('badChecksum') }
    }
  }

  const entropyHex = bytesToHex(entropy)
  return { valid: true, words: parts, wordCount: parts.length, indices, entropy, entropyHex, strength }
}

/**
 * Re-encodes a mnemonic into another language. Both wordlists are indexed the
 * same way, so the conversion is a positional remap with no hashing involved —
 * which is why a converted mnemonic is bit-for-bit the same wallet.
 */
export function convertMnemonic(mnemonic: string, from: string[], to: string[], separator = ' '): string {
  const validation = validateMnemonic(mnemonic, from)
  if (!validation.valid) throw validation.error ?? new Bip39Error('badChecksum')
  return validation.indices.map((position) => to[position]).join(separator)
}

/** Detects which bundled wordlist a mnemonic belongs to, or null when none match. */
export function detectLanguage(
  mnemonic: string,
  candidates: { language: Bip39Language; words: string[] }[]
): Bip39Language | null {
  for (const candidate of candidates) {
    if (validateMnemonic(mnemonic, candidate.words).valid) return candidate.language
  }
  return null
}

/**
 * BIP39 seed: PBKDF2-HMAC-SHA512 over the mnemonic, salted with the literal
 * string "mnemonic" plus the optional passphrase, NFKD-normalised on both sides.
 */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  const normalizedPassphrase = normalize(passphrase)
  if (normalizedPassphrase.length > 0 && /[\uD800-\uDFFF]/.test(normalizedPassphrase)) {
    throw new Bip39Error('badPassphrase')
  }
  return pbkdf2(sha512, utf8ToBytes(normalize(mnemonic)), utf8ToBytes(`mnemonic${normalizedPassphrase}`), {
    c: PBKDF2_ROUNDS,
    dkLen: SEED_LENGTH
  })
}

export function mnemonicToSeedHex(mnemonic: string, passphrase = ''): string {
  return bytesToHex(mnemonicToSeed(mnemonic, passphrase))
}

/** Parses user-entered hex entropy, accepting an optional 0x prefix. */
export function parseEntropyHex(value: string): Uint8Array {
  const cleaned = value.trim().replace(/^0x/i, '').replace(/\s+/g, '')
  if (cleaned.length === 0) throw new Bip39Error('badEntropyHex')
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Bip39Error('badEntropyHex')
  if (cleaned.length % 2 !== 0) throw new Bip39Error('badEntropyHex')
  const bytes = hexToBytes(cleaned)
  if (bytes.length < 16 || bytes.length > 32) throw new Bip39Error('badEntropyLength')
  if (bytes.length % 4 !== 0) throw new Bip39Error('badEntropyLength')
  return bytes
}
