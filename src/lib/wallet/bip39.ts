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
const indexCache = new Map<Bip39Language, Promise<WordlistIndex>>()

/**
 * Romanised readings, where the list has them.
 *
 * Both Chinese lists are 2048 characters in the same order, so they share one
 * module. The dynamic import is resolved once per session by the bundler, so
 * loading it for both lists costs a single fetch.
 */
const readingLoaders: Partial<Record<Bip39Language, () => Promise<string[]>>> = {
  'chinese-simplified': () => import('./wordlists/chinese-pinyin.ts').then((module) => module.default),
  'chinese-traditional': () => import('./wordlists/chinese-pinyin.ts').then((module) => module.default)
}

/** Whether the text is plain Latin letters, the only thing a reading can match. */
function isLatin(value: string): boolean {
  return value.length > 0 && value.length <= 16 && /^[a-z]+$/.test(value)
}

/**
 * Loads a wordlist and the search index for it, including romanised readings
 * where the list has them.
 *
 * Separate from {@link loadWordlist} so that callers which only need the words —
 * entropy conversion, checksum validation — never pull the extra table in.
 */
export function loadWordlistIndex(language: Bip39Language): Promise<WordlistIndex> {
  const cached = indexCache.get(language)
  if (cached) return cached
  const pending = Promise.all([loadWordlist(language), readingLoaders[language]?.() ?? null]).then(
    ([words, readings]) => createWordlistIndex(words, readings ?? undefined)
  )
  indexCache.set(language, pending)
  return pending
}

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
 * Runs of characters that separate mnemonic words: ordinary whitespace plus the
 * ideographic space, which is what the Japanese list conventionally uses.
 *
 * Validation, highlighting and word-replacement all have to agree on where a
 * word begins and ends, so they share this one pattern. A second, subtly
 * different copy is how the red highlight ends up one character off from the
 * word the validator actually rejected.
 */
const SEPARATORS = /[\s　]+/u

/**
 * Canonical form every wordlist lookup is keyed on.
 *
 * Two things have to be folded or lookups fail: case, because the user may
 * paste `Abandon`; and NFKD, because the Japanese list is *stored* decomposed
 * while the IME hands over precomposed kana such as `あい` (U+3042 U+3044) for
 * the same text the list spells `あい` (U+3042 U+309A U+3044). Without the fold
 * Japanese suggestions would never match anything.
 */
const canonicalWord = (word: string): string => normalize(word.trim().toLowerCase())

/** Looks a word up case-insensitively, in both raw and canonical form. */
function indexOfWord(words: string[], word: string): number {
  return words.indexOf(canonicalWord(word))
}

/** Splits user input into words, tolerating newlines, tabs and full-width spaces. */
export function splitMnemonic(value: string): string[] {
  return value
    .trim()
    .split(SEPARATORS)
    .filter(Boolean)
}

export type MnemonicWordSpan = {
  /** The text between separators, exactly as typed. */
  text: string
  /** Inclusive start offset in the source string. */
  start: number
  /** Exclusive end offset in the source string. */
  end: number
  /** Zero-based position among the words, ignoring separators. */
  index: number
}

/**
 * Splits a mnemonic while recording where each word sits in the source string.
 *
 * `splitMnemonic` returns bare strings and throws the separators away, which is
 * enough to validate but not enough to paint: highlighting a word in place
 * needs its offsets, and replacing a word needs its bounds. This is the single
 * tokenizer the editor drives its cursor logic from.
 */
export function tokenizeMnemonic(value: string): MnemonicWordSpan[] {
  const spans: MnemonicWordSpan[] = []
  let cursor = 0
  while (cursor < value.length) {
    if (SEPARATORS.test(value[cursor])) {
      cursor += 1
      continue
    }
    let end = cursor
    while (end < value.length && !SEPARATORS.test(value[end])) end += 1
    spans.push({ text: value.slice(cursor, end), start: cursor, end, index: spans.length })
    cursor = end
  }
  return spans
}

/**
 * A wordlist prepared for the per-keystroke work the editor does on it.
 *
 * NFKD-normalising 2048 entries on every keypress is the one genuinely
 * expensive thing here, so the canonical forms are computed once and reused.
 */
export type WordlistIndex = {
  /** The wordlist, verbatim. */
  words: string[]
  /** Canonical form to list position. */
  positions: Map<string, number>
  /** Canonical form of each entry, parallel to `words`. */
  canonical: string[]
  /**
   * Romanised reading of each entry, parallel to `words`, when the list has one.
   *
   * The two Chinese lists are 2048 single characters, so the field can only be
   * filled in by an IME that produces Han — or by a person who knows the
   * characters. Matching the reading as well lets a Latin keyboard reach the same
   * words, which is the only way to type them once the IME is set to English.
   */
  readings?: string[]
}

export function createWordlistIndex(words: string[], readings?: string[]): WordlistIndex {
  const canonical = words.map(canonicalWord)
  const positions = new Map<string, number>()
  for (let position = 0; position < canonical.length; position += 1) {
    // First occurrence wins, so a hypothetical duplicate resolves the way
    // `indexOf` would rather than to whichever copy came last.
    if (!positions.has(canonical[position])) positions.set(canonical[position], position)
  }
  if (readings && readings.length !== words.length) {
    throw new Error(`wordlist has ${words.length} entries but ${readings.length} readings`)
  }
  return readings ? { words, positions, canonical, readings } : { words, positions, canonical }
}

/** The romanised reading of a word in the list, or '' when the list has none. */
export function readingOf(word: string, index: WordlistIndex): string {
  if (!index.readings) return ''
  const position = index.positions.get(canonicalWord(word))
  return position === undefined ? '' : index.readings[position]
}

/** List position of a typed word, or -1 when the list does not contain it. */
export function findWordPosition(word: string, index: WordlistIndex): number {
  return index.positions.get(canonicalWord(word)) ?? -1
}

/** Whether every typed word exists in the list. Cheap enough to run per keypress. */
export function findUnknownWordIndices(spans: MnemonicWordSpan[], index: WordlistIndex): number[] {
  const unknown: number[] = []
  for (const span of spans) {
    if (!index.positions.has(canonicalWord(span.text))) unknown.push(span.index)
  }
  return unknown
}

/**
 * Whether every character of `needle` appears in `haystack` in order, with
 * anything allowed in between.
 *
 * Indexed by UTF-16 code unit on both sides so that an astral character only
 * matches as a whole pair rather than half-matching against a neighbour.
 */
function isSubsequence(needle: string, haystack: string): boolean {
  let matched = 0
  for (let cursor = 0; cursor < haystack.length && matched < needle.length; cursor += 1) {
    if (haystack[cursor] === needle[matched]) matched += 1
  }
  return matched === needle.length
}

/**
 * Levenshtein distance with a hard ceiling, computed on a single rolling row.
 *
 * The ceiling is what keeps this affordable: a scan over 2048 words is only
 * acceptable while the distance function is linear in the input length, and a
 * user pasting a whole sentence into the field would otherwise make every
 * comparison quadratic. Once a whole row sits above the ceiling the answer
 * cannot come back under it, so the scan stops there.
 */
function editDistanceWithin(a: string, b: string, ceiling: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1
  let previous = Array.from({ length: b.length + 1 }, (_, position) => position)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    let rowBest = row
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = a[row - 1] === b[column - 1] ? 0 : 1
      const value = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + substitution)
      current.push(value)
      if (value < rowBest) rowBest = value
    }
    if (rowBest > ceiling) return ceiling + 1
    previous = current
  }
  return previous[b.length]
}

/**
 * Ranks wordlist entries that could complete what the user has typed so far.
 *
 * Words that start with the input always come first, ranked by length: typing
 * `ab` and seeing the shortest completion lead with `able` is the useful answer,
 * and a word the user is simply part-way through typing needs no closer measure
 * than that.
 *
 * Past that, a match no longer means "a completion" but "a recovery" — the user
 * mistyped something and needs the word back. Those are ranked by edit distance
 * rather than by a structural test, because a structural test cannot rank
 * `bandon` (a dropped first letter) against `abandon` in any principled way.
 *
 * The returned strings are the *verbatim* wordlist entries, not their canonical
 * forms, so applying a candidate writes the canonical spelling back into the
 * textarea rather than the folded one the user typed.
 */
export function findWordCandidates(input: string, index: WordlistIndex, limit = 8): string[] {
  const needle = canonicalWord(input)
  // The longest entry in any shipped list is eight characters (`abstract`);
  // nothing longer is a word, and refusing it keeps a pasted sentence from
  // reaching the distance scan below.
  if (needle.length === 0 || needle.length > 20) return []

  // A slip is a few keystrokes, so a candidate further than this many edits away
  // is not what was meant and costs nothing to discard.
  const ceiling = Math.max(2, Math.ceil(needle.length / 2))
  const prefix: { word: string; key: string }[] = []
  const recovery: { word: string; distance: number }[] = []
  const seen = new Set<string>()

  // A candidate matched through its reading is ranked on the reading, not on the
  // character, so `y` leads with the shortest reading rather than with whichever
  // character happens to sit near the front of the list.
  const rank = (word: string, key: string) => {
    prefix.push({ word, key })
    seen.add(word)
  }

  for (let position = 0; position < index.canonical.length; position += 1) {
    const word = index.words[position]
    if (seen.has(word)) continue
    const haystacks = [index.canonical[position]]
    // The reading is only reachable from Latin input. Testing it against a Han
    // needle could only ever find a coincidental edit distance, never an intent.
    if (index.readings && isLatin(needle)) haystacks.push(index.readings[position])

    for (const haystack of haystacks) {
      if (haystack === undefined) continue
      if (haystack.startsWith(needle)) {
        rank(word, haystack)
        break
      }
      if (haystack.includes(needle) || isSubsequence(needle, haystack)) {
        seen.add(word)
        recovery.push({ word, distance: editDistanceWithin(needle, haystack, ceiling) })
        break
      }
    }
  }

  // Swapping two keys breaks the subsequence order, so a transposed word is
  // invisible to both passes above. Comparing every word is the only way to find
  // it, so that pass runs last, and only when nothing starts with the input at
  // all — a prefix match means the user is typing forward and is on course, and
  // padding `aban` with unrelated near-misses would be noise, not help. The
  // distance function bails out after a row or two for anything hopeless, which
  // is what keeps the scan affordable.
  //
  // It is skipped outright for the single-character lists. Substituting one Han
  // character for another is one edit, so every entry in the list ties at the same
  // distance and the scan can only return the first few in wordlist order — the
  // beginning of the list, offered as though it had anything to do with the input.
  const singleCharacterList = index.canonical.every((word) => word.length === 1)
  const distant: { word: string; distance: number }[] = []
  if (prefix.length === 0 && recovery.length < limit && !(singleCharacterList && needle.length === 1)) {
    for (let position = 0; position < index.canonical.length; position += 1) {
      const word = index.words[position]
      if (seen.has(word)) continue
      const reading = index.readings && isLatin(needle) ? index.readings[position] : undefined
      const distance = Math.min(
        editDistanceWithin(needle, index.canonical[position], ceiling),
        reading === undefined ? Number.POSITIVE_INFINITY : editDistanceWithin(needle, reading, ceiling)
      )
      if (distance <= ceiling) distant.push({ word, distance })
    }
  }

  // Both sorts are stable, so equal keys keep wordlist order, which is
  // alphabetical for English and codepoint order for the CJK lists. Among
  // equidistant recoveries the closer length wins: a mistyped word is the right
  // length, whereas a shorter word at the same distance is simply a different
  // word that happens to be reachable (`acouunt` is two edits from both `account`
  // and `amount`, and only the length tells them apart).
  const byDistance = (a: { word: string; distance: number }, b: { word: string; distance: number }) =>
    a.distance - b.distance ||
    Math.abs(a.word.length - needle.length) - Math.abs(b.word.length - needle.length)
  prefix.sort((a, b) => a.key.length - b.key.length)
  const merged = [...recovery, ...distant].sort(byDistance)
  return [...prefix.map((entry) => entry.word), ...merged.map((entry) => entry.word)].slice(0, limit)
}

/** Why a mnemonic failed to validate, in the order the remedies are needed. */
export type MnemonicFault = 'wordCount' | 'unknown' | 'mixed' | 'checksum'

export type MnemonicInspection = {
  reason: MnemonicFault
  /** Word positions to mark, most useful first. May be empty. */
  indices: number[]
}

/**
 * Works out what is wrong with a mnemonic, and which words to point at.
 *
 * The reason and the marked words come out of one pass deliberately. They used
 * to be worked out separately, which is how "these N words are in none of the
 * bundled wordlists" came to be printed under a field with nothing marked in it,
 * and how a mixed-language paste could be named without ever showing where the
 * mix was.
 *
 * Order matters, and it is the order the remedies are needed in. A word count
 * that is not a BIP39 length means the paste was truncated or doubled. A word in
 * no list has to be retyped, and until it is, a mix elsewhere in the field is not
 * yet the thing worth reporting. Words drawn from more than one list can never
 * validate, and retyping them one at a time will not help. And a full set of
 * individually valid words that still fails means the order is wrong, which
 * retyping will not fix either.
 *
 * `ownerOf` reports which wordlists hold a word, because that is the one thing
 * this needs to know about the lists themselves; the caller supplies it so this
 * stays independent of which languages are bundled.
 */
export function inspectMnemonic(
  parts: string[],
  ownerOf: (word: string) => string[]
): MnemonicInspection {
  const unknown = parts.flatMap((word, index) => (ownerOf(word).length === 0 ? [index] : []))
  if (strengthFromWordCount(parts.length) === null) return { reason: 'wordCount', indices: unknown }
  if (unknown.length > 0) return { reason: 'unknown', indices: unknown }

  // Which lists the words belong to. A word can be in more than one — the two
  // Chinese lists share a good number of characters — so it joins every group it
  // qualifies for and stays markable from either side.
  const groups = new Map<string, number[]>()
  for (const [index, word] of parts.entries()) {
    for (const language of ownerOf(word)) {
      const group = groups.get(language)
      if (group) group.push(index)
      else groups.set(language, [index])
    }
  }
  // Every word is in at least one list by now, so there is always a group to
  // compare against.
  if (groups.size <= 1) return { reason: 'checksum', indices: unknown }

  // The list most of the words agree on is the one that was meant; the rest
  // arrived from somewhere else and are what has to be corrected. When the split
  // is even there is no majority to appeal to, so the list of the first word
  // anchors it — the only thing that tells the two sides apart — and a
  // deterministic answer beats leaving the field unmarked.
  let intended = ''
  for (const [language, group] of groups) {
    if (intended === '') {
      intended = language
      continue
    }
    const best = groups.get(intended) as number[]
    if (group.length > best.length || (group.length === best.length && group.includes(0) && !best.includes(0))) {
      intended = language
    }
  }
  // Marking the majority instead would point at everything except the mistake.
  const foreign = parts.flatMap((word, index) => (ownerOf(word).includes(intended) ? [] : [index]))
  // More than one list represented is *not* on its own a mix. The two Chinese
  // lists share so many characters that a perfectly valid 12-word simplified
  // mnemonic has most of its words in the traditional list too — up to eleven of
  // twelve — so a valid mnemonic builds a second group while no word is actually
  // foreign. Reporting that as a mix gives the worst of both worlds: a message
  // blaming a mix that does not exist, and its own count reading "0 words from
  // another wordlist have been marked". A mix means words that are *not* in the
  // intended list, so if none are, the words were all in that list and the fault
  // is whatever comes after.
  if (foreign.length === 0) return { reason: 'checksum', indices: [] }
  return { reason: 'mixed', indices: foreign }
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
