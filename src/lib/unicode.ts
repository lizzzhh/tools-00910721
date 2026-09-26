export type UnicodeStyle = 'short' | 'long' | 'hex' | 'decimal'

export type UnicodeScope = 'non-ascii' | 'control'

export type UnicodeResult =
  | {
      ok: true
      output: string
      replaced: number
      inputLength: number
      outputLength: number
    }
  | {
      ok: false
      message: string
      position?: number
    }

export type CodePointRow = {
  character: string
  hex: string
  decimal: number
  escape: string
  utf8: string
}

export type CodePointReport = {
  ok: true
  rows: CodePointRow[]
  distinct: number
  total: number
}

function formatHex(codePoint: number) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}

export function escapeCodePoint(codePoint: number, style: UnicodeStyle = 'short') {
  if (style === 'decimal') return String(codePoint)
  if (style === 'hex') return codePoint.toString(16).toUpperCase().padStart(4, '0')
  if (style === 'long') {
    return codePoint > 0xffff ? `\\u{${codePoint.toString(16).toUpperCase()}}` : `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
  }
  if (codePoint > 0xffff) {
    const high = 0xd800 + ((codePoint - 0x10000) >> 10)
    const low = 0xdc00 + ((codePoint - 0x10000) & 0x3ff)
    return `\\u${high.toString(16).toUpperCase().padStart(4, '0')}\\u${low.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}

function needsEscape(codePoint: number, scope: UnicodeScope) {
  if (codePoint > 0x7f) return true
  if (scope === 'control') return codePoint < 0x20 || codePoint === 0x7f
  return false
}

export function encodeUnicode(input: string, style: UnicodeStyle = 'short', scope: UnicodeScope = 'non-ascii'): UnicodeResult {
  const isList = style === 'hex' || style === 'decimal'
  const values: string[] = []
  let replaced = 0
  let index = 0

  while (index < input.length) {
    const codePoint = input.codePointAt(index) ?? 0
    const size = codePoint > 0xffff ? 2 : 1
    if (isList || needsEscape(codePoint, scope)) {
      values.push(escapeCodePoint(codePoint, style))
      replaced += 1
    } else {
      values.push(input.slice(index, index + size))
    }
    index += size
  }

  const output = isList ? values.join(' ') : values.join('')
  return { ok: true, output, replaced, inputLength: input.length, outputLength: output.length }
}

const escapePatternSource = '%u[0-9a-fA-F]{4}|&#[xX]?[0-9a-fA-F]+;|\\\\(?:u\\{[0-9a-fA-F]{1,6}\\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|.)'

const controlEscapes: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
  '/': '/',
  $: '$'
}

type EscapeResult = { ok: true; character: string; surrogate: boolean } | { ok: false; message: string; position: number }

function isSurrogateCodePoint(codePoint: number) {
  return codePoint >= 0xd800 && codePoint <= 0xdfff
}

function resolveEscape(raw: string, start: number): EscapeResult {
  let digits = ''
  let radix = 16
  let controlBody: string | undefined

  if (raw.startsWith('%u')) {
    digits = raw.slice(2)
  } else if (raw.startsWith('&#')) {
    const body = raw.slice(2).replace(/;$/, '')
    if (body[0] === 'x' || body[0] === 'X') digits = body.slice(1)
    else {
      digits = body
      radix = 10
    }
  } else {
    const body = raw.slice(1)
    if (body[0] === 'u' && body[1] === '{') digits = body.slice(2, -1)
    else if (body[0] === 'u') digits = body.slice(1)
    else if (body[0] === 'x') digits = body.slice(1)
    else if (/^[0-7]{1,3}$/.test(body)) {
      digits = body
      radix = 8
    } else controlBody = body
  }

  if (controlBody !== undefined) return { ok: true, character: controlEscapes[controlBody] ?? controlBody, surrogate: false }

  const codePoint = Number.parseInt(digits, radix)
  if (!digits || !Number.isFinite(codePoint) || codePoint > 0x10ffff) {
    return { ok: false, message: `无效的字符码点 ${raw}`, position: start + 1 }
  }
  if (isSurrogateCodePoint(codePoint)) {
    return { ok: true, character: String.fromCharCode(codePoint), surrogate: true }
  }
  return { ok: true, character: String.fromCodePoint(codePoint), surrogate: false }
}

export function decodeUnicode(input: string): UnicodeResult {
  const pattern = new RegExp(escapePatternSource, 'g')
  let output = ''
  let replaced = 0
  let lastIndex = 0
  let match = pattern.exec(input)

  while (match) {
    const raw = match[0]
    const start = match.index
    let resolved = resolveEscape(raw, start)
    if (!resolved.ok) return resolved

    let cursor = start + raw.length

    if (resolved.surrogate) {
      const codePoint = resolved.character.codePointAt(0) ?? 0
      const isHigh = codePoint <= 0xdbff

      if (isHigh && input[cursor] === '\\') {
        pattern.lastIndex = cursor
        const next = pattern.exec(input)
        if (next) {
          const low = resolveEscape(next[0], cursor)
          if (!low.ok) return low
          if (low.surrogate && (low.character.codePointAt(0) ?? 0) >= 0xdc00) {
            const combined = (codePoint - 0xd800) * 0x400 + ((low.character.codePointAt(0) ?? 0) - 0xdc00) + 0x10000
            resolved = { ok: true, character: String.fromCodePoint(combined), surrogate: false }
            cursor += next[0].length
            replaced += 1
          }
        }
      }

      if (resolved.surrogate) {
        return { ok: false, message: `代理项码点 ${raw} 缺少配对的低代理项`, position: start + 1 }
      }
    }

    output += input.slice(lastIndex, start) + resolved.character
    replaced += 1
    lastIndex = cursor
    match = pattern.exec(input)
  }

  output += input.slice(lastIndex)

  return { ok: true, output, replaced, inputLength: input.length, outputLength: output.length }
}

export function inspectCodePoints(input: string, limit = 500): CodePointReport {
  const rows: CodePointRow[] = []
  const seen = new Set<number>()
  let index = 0
  let total = 0

  while (index < input.length) {
    const codePoint = input.codePointAt(index) ?? 0
    const size = codePoint > 0xffff ? 2 : 1
    const character = input.slice(index, index + size)
    seen.add(codePoint)
    total += 1

    if (rows.length < limit) {
      rows.push({
        character,
        hex: formatHex(codePoint),
        decimal: codePoint,
        escape: escapeCodePoint(codePoint, 'long'),
        utf8: Array.from(new TextEncoder().encode(character))
          .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
          .join(' ')
      })
    }

    index += size
  }

  return { ok: true, rows, distinct: seen.size, total }
}
