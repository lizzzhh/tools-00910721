/**
 * Just enough JSON colouring for the data page.
 *
 * A stored value is only ever text, and most of what the site stores is text
 * that happens to be JSON. Rather than pull in a highlighter to mark up a
 * handful of rows, this walks the string once and reports which piece is which,
 * leaving the page to decide what colour a piece gets.
 *
 * The result is a list of plain pieces rather than HTML on purpose: a value can
 * hold anything someone typed into a note, and the caller writes it into the
 * document as text.
 */

export type TokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain'

export type JsonToken = { kind: TokenKind; text: string }

const isDigit = (char: string): boolean => char >= '0' && char <= '9'

/** Reads a quoted string, honouring the escapes JSON allows inside one. */
function readString(text: string, start: number): number {
  let index = start + 1
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') return index + 1
    index += 1
  }
  return text.length
}

function readNumber(text: string, start: number): number {
  let index = start
  while (index < text.length && /[0-9eE+.\-]/.test(text[index])) index += 1
  return index
}

function readWord(text: string, start: number): number {
  let index = start
  while (index < text.length && /[a-z]/.test(text[index])) index += 1
  return index
}

const isBlank = (char: string | undefined): boolean => char === ' ' || char === '\n' || char === '\t' || char === '\r'

/**
 * The pieces of a JSON document, in order, with neighbouring pieces of the same
 * kind joined together so the caller builds as few elements as it can.
 *
 * `null` means the text is not JSON at all: a bare word like `dark` is a stored
 * value too, and showing it as a single plain piece is the honest rendering.
 */
export function tokenizeJson(text: string): JsonToken[] | null {
  try {
    JSON.parse(text)
  } catch {
    return null
  }

  const tokens: JsonToken[] = []
  const push = (kind: TokenKind, piece: string) => {
    if (!piece) return
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind) last.text += piece
    else tokens.push({ kind, text: piece })
  }

  let index = 0
  while (index < text.length) {
    const char = text[index]

    if (isBlank(char)) {
      let end = index
      while (end < text.length && isBlank(text[end])) end += 1
      push('plain', text.slice(index, end))
      index = end
      continue
    }

    if (char === '"') {
      const end = readString(text, index)
      // A string followed by a colon is a name; any other string is a value.
      let after = end
      while (after < text.length && isBlank(text[after])) after += 1
      push(text[after] === ':' ? 'key' : 'string', text.slice(index, end))
      index = end
      continue
    }

    if (char === '{' || char === '}' || char === '[' || char === ']' || char === ',' || char === ':') {
      push('punctuation', char)
      index += 1
      continue
    }

    if (isDigit(char) || (char === '-' && isDigit(text[index + 1] ?? ''))) {
      const end = readNumber(text, index)
      push('number', text.slice(index, end))
      index = end
      continue
    }

    if (/[a-z]/.test(char)) {
      const end = readWord(text, index)
      const word = text.slice(index, end)
      push(word === 'true' || word === 'false' ? 'boolean' : word === 'null' ? 'null' : 'plain', word)
      index = end
      continue
    }

    push('plain', char)
    index += 1
  }

  return tokens
}
