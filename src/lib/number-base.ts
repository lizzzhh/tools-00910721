export const minBase = 2

export const maxBase = 36

export const extraBases = [58, 62]

export const numberBases: number[] = [
  ...Array.from({ length: maxBase - minBase + 1 }, (_, index) => index + minBase),
  ...extraBases
]

export const commonBases: number[] = [2, 8, 10, 16, 32, 36, 58, 62]

export type NumberBase = number

export type NumberBaseErrorCode =
  | 'emptyInput'
  | 'prefixOnly'
  | 'decimalNotSupported'
  | 'invalidDigit'
  | 'unsupportedBase'

export type NumberResult =
  | {
      ok: true
      value: bigint
      negative: boolean
      digits: Record<number, string>
      inputLength: number
    }
  | {
      ok: false
      code: NumberBaseErrorCode
      char?: string
      base?: number
      position?: number
    }

// Bitcoin omits 0, O, I and l so glyphs stay unambiguous.
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base62Alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export type NamedBaseId =
  | 'binary'
  | 'octal'
  | 'decimal'
  | 'hexadecimal'
  | 'base32'
  | 'base36'
  | 'base58'
  | 'base62'

const namedBaseIds: Record<number, NamedBaseId> = {
  2: 'binary',
  8: 'octal',
  10: 'decimal',
  16: 'hexadecimal',
  32: 'base32',
  36: 'base36',
  58: 'base58',
  62: 'base62'
}

const prefixedBases: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' }

export function baseNameId(base: number): NamedBaseId | undefined {
  return namedBaseIds[base]
}

export function baseIsSigned(base: number) {
  return base === 10
}

export function basePrefix(base: number) {
  return prefixedBases[base] ?? ''
}

export function isNumberBase(value: number | string): value is NumberBase {
  const base = Number(value)
  return Number.isInteger(base) && numberBases.includes(base)
}

export function detectBase(input: string): NumberBase {
  const value = input.trim().toLowerCase().replace(/^[+-]/, '')
  for (const base of [2, 8, 16]) {
    if (value.startsWith(prefixedBases[base])) return base
  }
  return 10
}

function digitValue(character: string) {
  const code = character.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48
  const lower = character.toLowerCase()
  if (lower >= 'a' && lower <= 'z') return lower.charCodeAt(0) - 87
  return -1
}

function formatWithAlphabet(value: bigint, base: number, alphabet: string) {
  const radix = BigInt(base)
  const negative = value < 0n
  let remaining = negative ? -value : value
  if (remaining === 0n) return '0'

  let output = ''
  while (remaining > 0n) {
    output = alphabet[Number(remaining % radix)] + output
    remaining /= radix
  }

  return negative ? `-${output}` : output
}

export function toDigits(value: bigint, base: number): string {
  if (base === 58) return formatWithAlphabet(value, base, base58Alphabet)
  if (base === 62) return formatWithAlphabet(value, base, base62Alphabet)
  if (base < minBase || base > maxBase) throw new RangeError(`unsupported base ${base}`)
  return value.toString(base).toUpperCase()
}

function parseMagnitude(
  body: string,
  radix: number
): { ok: true; value: bigint } | { ok: false; code: 'invalidDigit'; char: string; base: number; position: number } {
  const radixValue = BigInt(radix)
  let value = 0n

  for (let index = 0; index < body.length; index += 1) {
    const digit = digitValue(body[index])
    if (digit < 0 || digit >= radix) {
      return { ok: false, code: 'invalidDigit', char: body[index], base: radix, position: index + 1 }
    }
    value = value * radixValue + BigInt(digit)
  }

  return { ok: true, value }
}

export function convertNumber(input: string, from: NumberBase): NumberResult {
  let value = input.trim()
  if (!value) return { ok: false, code: 'emptyInput' }

  const negative = value.startsWith('-')
  if (negative || value.startsWith('+')) value = value.slice(1)
  if (!value) return { ok: false, code: 'emptyInput' }

  const cleaned = value.replace(/[\s_,]/g, '')
  const prefix = basePrefix(from)
  const body = prefix && cleaned.toLowerCase().startsWith(prefix) ? cleaned.slice(prefix.length) : cleaned
  if (!body) return { ok: false, code: 'prefixOnly', base: from }
  if (body.includes('.')) return { ok: false, code: 'decimalNotSupported', position: body.indexOf('.') + 1 }

  const magnitude = parseMagnitude(body, from)
  if (!magnitude.ok) return magnitude

  const signed = negative ? -magnitude.value : magnitude.value
  const digits: Record<number, string> = {}
  for (const base of numberBases) digits[base] = toDigits(signed, base)

  return { ok: true, value: signed, negative, digits, inputLength: input.length }
}
