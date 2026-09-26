export type BaseEncoding = 'base32' | 'base58' | 'base62' | 'base64' | 'base85' | 'base91'

export type BaseResult =
  | {
      ok: true
      output: string
      byteLength: number
      outputLength: number
    }
  | {
      ok: false
      message: string
      position?: number
    }

export type Base64Result = BaseResult

type DecodeError = { error: string; position?: number }

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base62Alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const base91Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"'
const ascii85Alphabet = Array.from({ length: 85 }, (_, index) => String.fromCharCode(index + 33)).join('')
const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/

function removeWhitespace(value: string) {
  return value.replace(/[\t\n\f\r ]/g, '')
}

function getOutputLength(value: string) {
  return Array.from(value).length
}

function getInvalidCharacter(value: string, name: string, pattern: RegExp) {
  const index = [...value].findIndex((character) => !pattern.test(character))
  return { error: `包含无效的 ${name} 字符`, position: index >= 0 ? index + 1 : undefined }
}

function getInvalidAlphabetCharacter(value: string, name: string, alphabet: string) {
  const index = [...value].findIndex((character) => alphabet.indexOf(character) < 0)
  return index >= 0 ? { error: `包含无效的 ${name} 字符`, position: index + 1 } : undefined
}

function bytesToBaseN(bytes: Uint8Array, base: number, alphabet: string) {
  let leadingZeros = 0
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1

  let value = 0n
  for (const byte of bytes) value = value * 256n + BigInt(byte)

  const digits: number[] = []
  const radix = BigInt(base)
  while (value > 0n) {
    digits.push(Number(value % radix))
    value /= radix
  }
  digits.reverse()
  return alphabet[0].repeat(leadingZeros) + digits.map((digit) => alphabet[digit]).join('')
}

function baseNToBytes(value: string, base: number, alphabet: string, name: string): Uint8Array | DecodeError {
  const normalized = removeWhitespace(value)
  if (!normalized) return { error: `请输入 ${name} 内容` }
  const invalid = getInvalidAlphabetCharacter(normalized, name, alphabet)
  if (invalid) return invalid

  let leadingZeros = 0
  while (leadingZeros < normalized.length && normalized[leadingZeros] === alphabet[0]) leadingZeros += 1

  let numericValue = 0n
  const radix = BigInt(base)
  for (const character of normalized) numericValue = numericValue * radix + BigInt(alphabet.indexOf(character))

  const bytes: number[] = []
  while (numericValue > 0n) {
    bytes.push(Number(numericValue & 255n))
    numericValue >>= 8n
  }
  bytes.reverse()
  return Uint8Array.from([...new Array<number>(leadingZeros).fill(0), ...bytes])
}

function bytesToBase32(bytes: Uint8Array) {
  let output = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += base32Alphabet[(buffer >>> bits) & 31]
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) output += base32Alphabet[(buffer << (5 - bits)) & 31]
  while (output.length % 8 !== 0) output += '='
  return output
}

function base32ToBytes(value: string): Uint8Array | DecodeError {
  const normalized = removeWhitespace(value).toUpperCase()
  if (!normalized) return { error: '请输入 Base32 内容' }

  const firstPadding = normalized.indexOf('=')
  const data = firstPadding >= 0 ? normalized.slice(0, firstPadding) : normalized
  const padding = firstPadding >= 0 ? normalized.slice(firstPadding) : ''
  if (!data || !/^[A-Z2-7]+$/.test(data) || (padding && !/^=+$/.test(padding))) {
    return getInvalidCharacter(normalized, 'Base32', /^[A-Z2-7=]$/)
  }

  const remainder = data.length % 8
  if (remainder === 1 || remainder === 3 || remainder === 6) return { error: 'Base32 长度无效', position: data.length }
  if (padding) {
    const expectedPadding = remainder === 0 ? 0 : 8 - remainder
    if (padding.length !== expectedPadding) return { error: 'Base32 填充字符位置无效' }
  }

  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const character of data) {
    buffer = (buffer << 5) | base32Alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 255)
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0 && buffer !== 0) return { error: 'Base32 填充位无效' }
  return Uint8Array.from(bytes)
}

function bytesToAscii85(bytes: Uint8Array) {
  let output = ''
  let offset = 0
  while (offset + 4 <= bytes.length) {
    const group = bytes.subarray(offset, offset + 4)
    if (group.every((byte) => byte === 0)) {
      output += 'z'
    } else {
      output += encodeAscii85Group(group, 5)
    }
    offset += 4
  }

  const remainder = bytes.length - offset
  if (remainder > 0) {
    const group = [...bytes.subarray(offset), ...new Array<number>(4 - remainder).fill(0)]
    output += encodeAscii85Group(group, remainder + 1)
  }
  return output
}

function encodeAscii85Group(bytes: ArrayLike<number>, length: number) {
  let value = 0
  for (let index = 0; index < bytes.length; index += 1) value = value * 256 + bytes[index]
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += ascii85Alphabet[Math.floor(value / 85 ** (4 - index)) % 85]
  }
  return output
}

function decodeAscii85Group(group: string): Uint8Array | DecodeError {
  if (group.length < 2 || group.length > 5) return { error: 'Base85 长度无效' }
  let value = 0
  for (const character of group) {
    const digit = ascii85Alphabet.indexOf(character)
    if (digit < 0) return { error: '包含无效的 Base85 字符' }
    value = value * 85 + digit
  }
  for (let index = group.length; index < 5; index += 1) value = value * 85 + 84
  if (value > 0xffffffff) return { error: 'Base85 数值超出范围' }

  const bytes: number[] = []
  for (let index = 0; index < group.length - 1; index += 1) {
    bytes.push(Math.floor(value / 256 ** (3 - index)) & 255)
  }
  return Uint8Array.from(bytes)
}

function ascii85ToBytes(value: string): Uint8Array | DecodeError {
  let normalized = removeWhitespace(value)
  const hasOpening = normalized.startsWith('<~')
  const hasClosing = normalized.endsWith('~>')
  if (hasOpening || hasClosing) {
    if (!hasOpening || !hasClosing) return { error: 'Base85 边界字符无效' }
    normalized = normalized.slice(2, -2)
  }
  if (!normalized) return { error: '请输入 Base85 内容' }

  const bytes: number[] = []
  let offset = 0
  while (offset < normalized.length) {
    if (normalized[offset] === 'z') {
      bytes.push(0, 0, 0, 0)
      offset += 1
      continue
    }

    const group = normalized.slice(offset, offset + 5)
    const paddingIndex = group.indexOf('z')
    if (paddingIndex >= 0) return { error: '包含无效的 Base85 字符', position: offset + paddingIndex + 1 }
    const decoded = decodeAscii85Group(group)
    if (!(decoded instanceof Uint8Array)) return decoded
    bytes.push(...decoded)
    offset += group.length
  }
  return Uint8Array.from(bytes)
}

function bytesToBase91(bytes: Uint8Array) {
  let accumulator = 0
  let bits = 0
  let output = ''

  for (const byte of bytes) {
    accumulator |= byte << bits
    bits += 8
    if (bits > 13) {
      let value = accumulator & 8191
      if (value > 88) {
        accumulator >>= 13
        bits -= 13
      } else {
        value = accumulator & 16383
        accumulator >>= 14
        bits -= 14
      }
      output += base91Alphabet[value % 91] + base91Alphabet[Math.floor(value / 91)]
    }
  }

  if (bits > 0) {
    output += base91Alphabet[accumulator % 91]
    if (bits > 7 || accumulator > 90) output += base91Alphabet[Math.floor(accumulator / 91)]
  }
  return output
}

function base91ToBytes(value: string): Uint8Array | DecodeError {
  const normalized = removeWhitespace(value)
  if (!normalized) return { error: '请输入 Base91 内容' }
  const invalid = getInvalidAlphabetCharacter(normalized, 'Base91', base91Alphabet)
  if (invalid) return invalid

  const bytes: number[] = []
  let accumulator = 0
  let bits = 0
  let pending = -1
  for (const character of normalized) {
    const digit = base91Alphabet.indexOf(character)
    if (pending < 0) {
      pending = digit
      continue
    }

    const pair = pending + digit * 91
    accumulator |= pair << bits
    bits += (pair & 8191) > 88 ? 13 : 14
    while (bits > 7) {
      bytes.push(accumulator & 255)
      accumulator >>= 8
      bits -= 8
    }
    pending = -1
  }
  if (pending >= 0) bytes.push((accumulator | (pending << bits)) & 255)
  return Uint8Array.from(bytes)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array | DecodeError {
  const normalized = removeWhitespace(value)
  if (!normalized) return { error: '请输入 Base64 内容' }
  if (!base64Pattern.test(normalized)) return getInvalidCharacter(normalized, 'Base64', /^[A-Za-z0-9+/=]$/)

  const firstPadding = normalized.indexOf('=')
  if (firstPadding >= 0 && firstPadding < normalized.length - (normalized.endsWith('==') ? 2 : 1)) {
    return { error: 'Base64 填充字符位置无效' }
  }

  const unpadded = normalized.replace(/=+$/, '')
  if (unpadded.length % 4 === 1) return { error: 'Base64 长度无效' }
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4)

  try {
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return { error: 'Base64 内容无效' }
  }
}

function encodeBytes(bytes: Uint8Array, encoding: BaseEncoding) {
  if (encoding === 'base32') return bytesToBase32(bytes)
  if (encoding === 'base58') return bytesToBaseN(bytes, 58, base58Alphabet)
  if (encoding === 'base62') return bytesToBaseN(bytes, 62, base62Alphabet)
  if (encoding === 'base64') return bytesToBase64(bytes)
  if (encoding === 'base85') return bytesToAscii85(bytes)
  return bytesToBase91(bytes)
}

function decodeBytes(value: string, encoding: BaseEncoding) {
  if (encoding === 'base32') return base32ToBytes(value)
  if (encoding === 'base58') return baseNToBytes(value, 58, base58Alphabet, 'Base58')
  if (encoding === 'base62') return baseNToBytes(value, 62, base62Alphabet, 'Base62')
  if (encoding === 'base64') return base64ToBytes(value)
  if (encoding === 'base85') return ascii85ToBytes(value)
  return base91ToBytes(value)
}

function decodeText(bytes: Uint8Array): BaseResult {
  try {
    const output = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ok: true, output, byteLength: bytes.byteLength, outputLength: getOutputLength(output) }
  } catch {
    return { ok: false, message: '解码结果不是有效的 UTF-8 文本' }
  }
}

export function encodeBase(input: string, encoding: BaseEncoding = 'base64'): BaseResult {
  const bytes = new TextEncoder().encode(input)
  const output = encodeBytes(bytes, encoding)
  return { ok: true, output, byteLength: bytes.byteLength, outputLength: getOutputLength(output) }
}

export function decodeBase(input: string, encoding: BaseEncoding = 'base64'): BaseResult {
  const result = decodeBytes(input, encoding)
  if (result instanceof Uint8Array) return decodeText(result)
  return { ok: false, message: result.error, ...(result.position === undefined ? {} : { position: result.position }) }
}

export function encodeBase64(input: string): BaseResult {
  return encodeBase(input, 'base64')
}

export function decodeBase64(input: string): BaseResult {
  return decodeBase(input, 'base64')
}
