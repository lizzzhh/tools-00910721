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

export type UuidSpec = {
  version: UuidVersion
  label: string
  kind: UuidKind
  kindLabel: string
  summary: string
}

export type UuidDetails = {
  value: string
  compact: string
  version: number | null
  versionLabel: string
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

export type UuidResult =
  | { ok: true; output: string; values: string[]; version: UuidVersion }
  | { ok: false; message: string }

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
  { version: 1, label: 'v1 · 时间戳', kind: 'time', kindLabel: '时间有序', summary: '100 纳秒时间戳加时钟序列，节点位取随机值' },
  { version: 2, label: 'v2 · DCE 安全', kind: 'time', kindLabel: '时间有序', summary: '在 v1 基础上用本地域编号替换时钟序列低位' },
  { version: 3, label: 'v3 · MD5 名称', kind: 'name', kindLabel: '名称派生', summary: '命名空间与名称拼接后的 MD5 摘要' },
  { version: 4, label: 'v4 · 随机', kind: 'random', kindLabel: '随机', summary: '完全随机来源，兼容性最好' },
  { version: 5, label: 'v5 · SHA-1 名称', kind: 'name', kindLabel: '名称派生', summary: '命名空间与名称拼接后的 SHA-1 摘要' },
  { version: 6, label: 'v6 · 重排时间戳', kind: 'time', kindLabel: '时间有序', summary: 'v1 时间戳重排为高位在前，天然可排序' },
  { version: 7, label: 'v7 · Unix 毫秒', kind: 'time', kindLabel: '时间有序', summary: '前 48 位为 Unix 毫秒，适合数据库主键' },
  { version: 8, label: 'v8 · 自定义', kind: 'custom', kindLabel: '自定义', summary: '实验版本，前缀为毫秒时间戳，后接自定义载荷' }
]

export const uuidVersionMap: Record<number, UuidSpec> = Object.fromEntries(uuidVersions.map((spec) => [spec.version, spec]))

export const uuidNamespaces = [
  { id: 'dns', label: 'DNS', hex: '6ba7b8109dad11d180b400c04fd430c8' },
  { id: 'url', label: 'URL', hex: '6ba7b8119dad11d180b400c04fd430c8' },
  { id: 'oid', label: 'OID', hex: '6ba7b8129dad11d180b400c04fd430c8' },
  { id: 'x500', label: 'X.500', hex: '6ba7b8149dad11d180b400c04fd430c8' },
  { id: 'custom', label: '自定义', hex: '' }
]

export const uuidDomains: { value: DceDomain; label: string }[] = [
  { value: 0, label: 'Person（个人）' },
  { value: 64, label: 'Group（组）' },
  { value: 128, label: 'Org（组织）' }
]

let clockSequence = Math.floor(Math.random() * 0x4000)
let lastTicks = 0n
let lastUnixMs = -1
let unixCounter = 0

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length)
  const source = globalThis.crypto

  if (!source?.getRandomValues) {
    throw new Error('当前环境不支持安全随机数，无法生成 UUID')
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

function createNamed(version: 3 | 5, namespaceHex: string, name: string) {
  const namespace = hexToBytes(namespaceHex)
  if (!namespace || namespace.length !== 16) {
    return { ok: false as const, message: '命名空间需要 32 位十六进制字符或合法 UUID' }
  }
  if (!name) return { ok: false as const, message: '请输入用于计算摘要的名称' }

  const nameBytes = Array.from(new TextEncoder().encode(name))
  const digest = hexToBytes(digestHex(version === 3 ? MD5 : SHA1, [...namespace, ...nameBytes]))
  if (!digest) return { ok: false as const, message: '摘要结果异常，无法生成 UUID' }

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
    if (!named.ok) throw new Error(named.message)
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
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
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
    versionLabel: form === 'nil' ? 'Nil 特殊格式' : form === 'max' ? 'Max 特殊格式' : spec ? `v${version}` : `未知版本 0x${version.toString(16)}`,
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
