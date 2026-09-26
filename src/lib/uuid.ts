import Core from 'crypto-js/core.js'
import MD5 from 'crypto-js/md5.js'
import SHA1 from 'crypto-js/sha1.js'

const WordArray = Core.lib.WordArray

export type UuidVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type UuidKind = 'time' | 'random' | 'name' | 'custom'
export type UuidCasing = 'lower' | 'upper'
export type UuidForm = 'standard' | 'compact' | 'braces'
export type UuidVariant = 'NCS' | 'RFC 4122' | 'Microsoft' | 'Future'
export type DceDomain = 0 | 64 | 128

export class UuidGenerationError extends Error {
  readonly code: UuidErrorCode

  constructor(code: UuidErrorCode) {
    super(code)
    this.name = 'UuidGenerationError'
    this.code = code
  }
}

export type UuidSpec = {
  version: UuidVersion
  nameId: `v${UuidVersion}`
  kind: UuidKind
  summaryId: `v${UuidVersion}`
}

export type UuidDetails = {
  value: string
  compact: string
  version: number | null
  versionLabelId: 'nil' | 'max' | 'unknown' | `v${UuidVersion}`
  unknownVersion: string | null
  kind: UuidKind | 'none'
  variant: UuidVariant
  form: 'nil' | 'max' | 'standard'
  timestamp: string | null
  timestampMs: number | null
  clockSequence: string | null
  dceDomain: number | null
  node: string | null
  multicast: boolean
  randomTail: string | null
  entropy: string | null
}

export type UuidErrorCode = 'noSecureRandom' | 'namespaceInvalid' | 'nameRequired' | 'digestFailed'

export type UuidResult =
  | { ok: true; output: string; values: string[]; version: UuidVersion }
  | { ok: false; code: UuidErrorCode }

export type UuidParsedRow = {
  index: number
  input: string
  details: UuidDetails | null
  error: string | null
}

export type UuidListResult = {
  rows: UuidParsedRow[]
  valid: number
  invalid: number
}

export type UuidGenerateOptions = {
  version?: UuidVersion
  count?: number
  casing?: UuidCasing
  form?: UuidForm
  prefix?: string
  namespace?: string
  name?: string
  domain?: DceDomain
  now?: number
}

export type UuidFormatOptions = {
  casing?: UuidCasing
  form?: UuidForm
  prefix?: string
}

export const gregorianOffsetMs = 12219292800000n

const gregorianTicksPerMs = 10000n

const hexTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'))

export const uuidVersions: UuidSpec[] = [
  { version: 1, nameId: 'v1', kind: 'time', summaryId: 'v1' },
  { version: 2, nameId: 'v2', kind: 'time', summaryId: 'v2' },
  { version: 3, nameId: 'v3', kind: 'name', summaryId: 'v3' },
  { version: 4, nameId: 'v4', kind: 'random', summaryId: 'v4' },
  { version: 5, nameId: 'v5', kind: 'name', summaryId: 'v5' },
  { version: 6, nameId: 'v6', kind: 'time', summaryId: 'v6' },
  { version: 7, nameId: 'v7', kind: 'time', summaryId: 'v7' },
  { version: 8, nameId: 'v8', kind: 'custom', summaryId: 'v8' }
]

export const uuidVersionMap: Record<number, UuidSpec> = Object.fromEntries(uuidVersions.map((spec) => [spec.version, spec]))

export type UuidNamespaceId = 'dns' | 'url' | 'oid' | 'x500' | 'custom'
export type UuidDomainId = 'person' | 'group' | 'org'

export const uuidNamespaces: { id: UuidNamespaceId; hex: string }[] = [
  { id: 'dns', hex: '6ba7b8109dad11d180b400c04fd430c8' },
  { id: 'url', hex: '6ba7b8119dad11d180b400c04fd430c8' },
  { id: 'oid', hex: '6ba7b8129dad11d180b400c04fd430c8' },
  { id: 'x500', hex: '6ba7b8149dad11d180b400c04fd430c8' },
  { id: 'custom', hex: '' }
]

export const uuidDomains: { value: DceDomain; id: UuidDomainId }[] = [
  { value: 0, id: 'person' },
  { value: 64, id: 'group' },
  { value: 128, id: 'org' }
]

let clockSequence = Math.floor(Math.random() * 0x4000)
let lastTicks = 0n
let lastUnixMs = -1
let unixCounter = 0

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length)
  const source = globalThis.crypto

  if (!source?.getRandomValues) {
    throw new UuidGenerationError('noSecureRandom')
  }

  source.getRandomValues(bytes)
  return bytes
}

function hexToBytes(hex: string) {
  const body = hex.toLowerCase().replace(/[^0-9a-f]/g, '')
  if (body.length % 2 !== 0) return null
  const bytes: number[] = []

  for (let index = 0; index < body.length; index += 2) {
    const value = Number.parseInt(body.slice(index, index + 2), 16)
    if (Number.isNaN(value)) return null
    bytes.push(value)
  }

  return bytes
}

function bytesToHex(bytes: number[] | Uint8Array) {
  return Array.from(bytes, (byte) => hexTable[byte & 0xff]).join('')
}

function setVersion(bytes: Uint8Array, version: number) {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4)
}

function setVariant(bytes: Uint8Array) {
  bytes[8] = (bytes[8] & 0x3f) | 0x80
}

function nextTicks(now: number) {
  const current = (BigInt(Math.floor(now)) + gregorianOffsetMs) * gregorianTicksPerMs
  const next = current > lastTicks ? current : lastTicks + 1n
  lastTicks = next
  return next
}

function writeV1Time(bytes: Uint8Array, ticks: bigint) {
  const timeLow = Number(ticks & 0xffffffffn)
  const timeMid = Number((ticks >> 32n) & 0xffffn)
  const timeHigh = Number((ticks >> 48n) & 0x0fffn)

  bytes[0] = (timeLow >>> 24) & 0xff
  bytes[1] = (timeLow >>> 16) & 0xff
  bytes[2] = (timeLow >>> 8) & 0xff
  bytes[3] = timeLow & 0xff
  bytes[4] = (timeMid >>> 8) & 0xff
  bytes[5] = timeMid & 0xff
  bytes[6] = (timeHigh >>> 8) & 0x0f
  bytes[7] = timeHigh & 0xff
}

function writeV6Time(bytes: Uint8Array, ticks: bigint) {
  const timeHigh = Number((ticks >> 28n) & 0xffffffffn)
  const timeMid = Number((ticks >> 12n) & 0xffffn)
  const timeLow = Number(ticks & 0x0fffn)

  bytes[0] = (timeHigh >>> 24) & 0xff
  bytes[1] = (timeHigh >>> 16) & 0xff
  bytes[2] = (timeHigh >>> 8) & 0xff
  bytes[3] = timeHigh & 0xff
  bytes[4] = (timeMid >>> 8) & 0xff
  bytes[5] = timeMid & 0xff
  bytes[6] = (timeLow >>> 8) & 0x0f
  bytes[7] = timeLow & 0xff
}

function writeMilliseconds(bytes: Uint8Array, milliseconds: number) {
  const value = BigInt(Math.max(0, Math.floor(milliseconds))) & 0xffffffffffffn
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((value >> BigInt(8 * (5 - index))) & 0xffn)
  }
}

function createV1(version: 1 | 2, domain: DceDomain, now: number) {
  const bytes = getRandomBytes(16)
  writeV1Time(bytes, nextTicks(now))
  setVersion(bytes, version)
  bytes[8] = 0x80 | ((clockSequence >> 8) & 0x3f)
  bytes[9] = version === 2 ? domain : clockSequence & 0xff
  bytes[10] |= 0x01
  return bytes
}

function createV4() {
  const bytes = getRandomBytes(16)
  setVersion(bytes, 4)
  setVariant(bytes)
  return bytes
}

function createV6(now: number) {
  const bytes = getRandomBytes(16)
  writeV6Time(bytes, nextTicks(now))
  setVersion(bytes, 6)
  setVariant(bytes)
  bytes[10] |= 0x01
  return bytes
}

function createV7(version: 7 | 8, now: number) {
  const bytes = getRandomBytes(16)
  const milliseconds = Math.floor(now)

  writeMilliseconds(bytes, milliseconds)

  if (version === 7 && milliseconds === lastUnixMs) {
    unixCounter = (unixCounter + 1) & 0x0fff
  } else {
    unixCounter = Math.floor(Math.random() * 0x1000)
  }
  lastUnixMs = milliseconds

  bytes[6] = (unixCounter >>> 8) & 0x0f
  bytes[7] = unixCounter & 0xff
  setVersion(bytes, version)
  setVariant(bytes)
  return bytes
}

function digestHex(hasher: typeof MD5 | typeof SHA1, bytes: number[]) {
  const words: number[] = []

  for (let index = 0; index < bytes.length; index += 4) {
    const chunk = bytes.slice(index, index + 4)
    words.push((((chunk[0] ?? 0) << 24) | ((chunk[1] ?? 0) << 16) | ((chunk[2] ?? 0) << 8) | (chunk[3] ?? 0)) >>> 0)
  }

  return hasher(WordArray.create(words, bytes.length)).toString()
}

function createNamed(version: 3 | 5, namespaceHex: string, name: string): { ok: true; bytes: Uint8Array } | { ok: false; code: UuidErrorCode } {
  const namespace = hexToBytes(namespaceHex)
  if (!namespace || namespace.length !== 16) {
    return { ok: false as const, code: 'namespaceInvalid' }
  }
  if (!name) return { ok: false as const, code: 'nameRequired' }

  const nameBytes = Array.from(new TextEncoder().encode(name))
  const digest = hexToBytes(digestHex(version === 3 ? MD5 : SHA1, [...namespace, ...nameBytes]))
  if (!digest) return { ok: false as const, code: 'digestFailed' }

  const bytes = Uint8Array.from(digest.slice(0, 16))
  setVersion(bytes, version)
  setVariant(bytes)
  return { ok: true as const, bytes }
}

export function isUuidVersion(value: number): value is UuidVersion {
  return uuidVersionMap[value] !== undefined
}

const hyphenatedPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const compactPattern = /^[0-9a-f]{32}$/

export function normalizeUuid(value: string) {
  const body = value
    .trim()
    .toLowerCase()
    .replace(/^urn:uuid:/, '')
    .trim()

  if (hyphenatedPattern.test(body)) return body.replace(/-/g, '')
  if (compactPattern.test(body)) return body

  const trailing = body.match(/([0-9a-f]{32})$/)
  if (trailing) return trailing[1]

  return body.replace(/[^0-9a-f]/g, '')
}

export function isUuid(value: string) {
  return /^[0-9a-f]{32}$/.test(normalizeUuid(value))
}

export function formatUuid(value: string, options: UuidFormatOptions = {}) {
  const { casing = 'lower', form = 'standard', prefix = '' } = options
  const compact = normalizeUuid(value)

  if (!/^[0-9a-f]{32}$/.test(compact)) return value

  const body =
    form === 'compact'
      ? compact
      : `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
  const cased = casing === 'upper' ? body.toUpperCase() : body

  return `${prefix}${form === 'braces' ? `{${cased}}` : cased}`
}

export function createUuid(options: Omit<UuidGenerateOptions, 'count'> = {}): string {
  const { version = 4, namespace = '', name = '', domain = 0, now = Date.now() } = options
  let bytes: Uint8Array

  if (version === 1 || version === 2) bytes = createV1(version, domain, now)
  else if (version === 4) bytes = createV4()
  else if (version === 6) bytes = createV6(now)
  else if (version === 7 || version === 8) bytes = createV7(version, now)
  else {
    const named = createNamed(version, namespace, name)
    if (!named.ok) throw new UuidGenerationError(named.code)
    bytes = named.bytes
  }

  return formatUuid(bytesToHex(bytes), options)
}

export function createUuids(options: UuidGenerateOptions = {}): UuidResult {
  const { version = 4, count = 1, now = Date.now() } = options
  const total = Math.min(1000, Math.max(1, Math.floor(count)))

  try {
    const values = Array.from({ length: total }, () => createUuid({ ...options, now }))
    return { ok: true, output: values.join('\n'), values, version }
  } catch (error) {
    const code = error instanceof UuidGenerationError ? error.code : 'digestFailed'
    return { ok: false, code }
  }
}

function readTicks(bytes: number[], version: number) {
  if (version === 6) {
    return (
      (BigInt(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) << 28n) |
      (BigInt((bytes[4] << 8) | bytes[5]) << 12n) |
      BigInt(((bytes[6] & 0x0f) << 8) | bytes[7])
    )
  }

  return (
    BigInt(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) |
    (BigInt((bytes[4] << 8) | bytes[5]) << 32n) |
    (BigInt(((bytes[6] & 0x0f) << 8) | bytes[7]) << 48n)
  )
}

function readMilliseconds(bytes: number[]) {
  let value = 0n
  for (let index = 0; index < 6; index += 1) value = (value << 8n) | BigInt(bytes[index])
  return value
}

export function describeUuid(value: string): UuidDetails | null {
  const compact = normalizeUuid(value)
  if (!/^[0-9a-f]{32}$/.test(compact)) return null

  const bytes = hexToBytes(compact)
  if (!bytes) return null

  const version = (bytes[6] >> 4) & 0x0f
  const variantTable: UuidVariant[] = ['NCS', 'Future', 'RFC 4122', 'Microsoft']
  const variant = variantTable[bytes[8] >> 6] ?? 'Future'
  const form: UuidDetails['form'] = /^0{32}$/.test(compact) ? 'nil' : /^f{32}$/.test(compact) ? 'max' : 'standard'
  const spec = uuidVersionMap[version]
  const hasGregorian = version === 1 || version === 2 || version === 6
  const hasUnixMs = version === 7 || version === 8
  const timestampMs = hasGregorian ? Number(readTicks(bytes, version) / gregorianTicksPerMs - gregorianOffsetMs) : hasUnixMs ? Number(readMilliseconds(bytes)) : null
  const date = timestampMs === null ? null : new Date(timestampMs)
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null
  const entropyBytes = version === 4 || version === 8 ? bytes.map((byte, index) => (index === 6 ? byte & 0x0f : index === 8 ? byte & 0x3f : byte)) : null

  return {
    value: formatUuid(compact),
    compact,
    version,
    versionLabelId: form === 'nil' ? 'nil' : form === 'max' ? 'max' : spec ? (spec.nameId as UuidDetails['versionLabelId']) : 'unknown',
    unknownVersion: spec ? null : `0x${version.toString(16)}`,
    kind: form === 'standard' ? (spec?.kind ?? 'none') : 'none',
    variant,
    form,
    timestamp: validDate ? validDate.toISOString() : null,
    timestampMs: validDate ? validDate.getTime() : null,
    clockSequence: hasGregorian ? ((bytes[8] & 0x3f) * 256 + bytes[9]).toString(16).padStart(4, '0').toUpperCase() : null,
    dceDomain: version === 2 ? bytes[9] : null,
    node: hasGregorian ? bytesToHex(bytes.slice(10)).toUpperCase() : null,
    multicast: hasGregorian ? (bytes[10] & 0x01) === 0x01 : false,
    randomTail: hasUnixMs ? bytesToHex(bytes.slice(9)).toUpperCase() : null,
    entropy: entropyBytes ? bytesToHex(entropyBytes).toUpperCase() : null
  }
}

export function splitUuidInput(input: string) {
  return input
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

export function parseUuidList(input: string): UuidListResult {
  const tokens = splitUuidInput(input)
  const rows = tokens.map((token, offset): UuidParsedRow => {
    const index = offset + 1
    const details = describeUuid(token)
    return {
      index,
      input: token,
      details,
      error: details ? null : `第 ${index} 项不是合法 UUID，需要 32 位十六进制字符`
    }
  })

  return {
    rows,
    valid: rows.filter((row) => row.details).length,
    invalid: rows.filter((row) => !row.details).length
  }
}
