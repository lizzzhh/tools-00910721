export const numberBases = [2, 8, 10, 16, 32, 36] as const

export type NumberBase = (typeof numberBases)[number]

export type NumberResult =
  | {
      ok: true
      value: bigint
      negative: boolean
      digits: Record<NumberBase, string>
      inputLength: number
    }
  | {
      ok: false
      message: string
      position?: number
    }

const prefixes: Record<number, string> = {
  2: '0b',
  8: '0o',
  10: '',
  16: '0x',
  32: '',
  36: ''
}

export const baseLabels: Record<NumberBase, string> = {
  2: '二进制',
  8: '八进制',
  10: '十进制',
  16: '十六进制',
  32: 'Base32',
  36: 'Base36'
}

export const basePrefixes: Record<NumberBase, string> = {
  2: '0b',
  8: '0o',
  10: '',
  16: '0x',
  32: '',
  36: ''
}

export function isNumberBase(value: number | string): value is NumberBase {
  return (numberBases as readonly number[]).includes(Number(value))
}

function digitValue(character: string) {
  const code = character.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48
  const lower = character.toLowerCase()
  if (lower >= 'a' && lower <= 'z') return lower.charCodeAt(0) - 87
  return -1
}

function parseMagnitude(body: string, radix: number): { ok: true; value: bigint } | { ok: false; message: string; position: number } {
  const radixValue = BigInt(radix)
  let value = 0n

  for (let index = 0; index < body.length; index += 1) {
    const digit = digitValue(body[index])
    if (digit < 0 || digit >= radix) {
      return { ok: false, message: `字符 ${body[index]} 不是 ${radix} 进制的有效数字`, position: index + 1 }
    }
    value = value * radixValue + BigInt(digit)
  }

  return { ok: true, value }
}

export function convertNumber(input: string, from: NumberBase): NumberResult {
  let value = input.trim()
  if (!value) return { ok: false, message: '请输入要转换的数字' }

  const negative = value.startsWith('-')
  if (negative || value.startsWith('+')) value = value.slice(1)
  if (!value) return { ok: false, message: '请输入要转换的数字' }

  const cleaned = value.replace(/[\s_,]/g, '')
  const prefix = prefixes[from]
  const body = prefix && cleaned.toLowerCase().startsWith(prefix) ? cleaned.slice(prefix.length) : cleaned
  if (!body) return { ok: false, message: `请输入 ${from} 进制的数字，不能只填写进制前缀` }
  if (body.includes('.')) return { ok: false, message: '仅支持整数，暂不支持小数转换', position: body.indexOf('.') + 1 }

  const magnitude = parseMagnitude(body, from)
  if (!magnitude.ok) return magnitude

  const signed = negative ? -magnitude.value : magnitude.value
  const digits = {} as Record<NumberBase, string>
  for (const base of numberBases) digits[base] = signed.toString(base).toUpperCase()

  return { ok: true, value: signed, negative, digits, inputLength: input.length }
}
