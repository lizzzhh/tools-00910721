/**
 * XML formatting and minification.
 *
 * The formatter is written as a token pass rather than a tree builder on purpose:
 * what a formatter has to get right is the text it must not touch. Comments, CDATA
 * sections, processing instructions and doctype declarations each have their own
 * rules about where whitespace counts, and a parser that only understands elements
 * quietly eats them. Here every one of those is a token with a name, so a document
 * round-trips whatever it contains.
 *
 * `DOMParser` is not used either. It is not available in a worker, it normalises
 * what it reads, and it turns a malformed document into a parse error the page would
 * have to explain rather than a position the reader could fix.
 */

export type XmlErrorCode = 'empty' | 'unclosedTag' | 'strayClose' | 'mismatchedTag' | 'unclosedComment' | 'badAttribute'

export type XmlTokenKind = 'open' | 'close' | 'selfClosing' | 'text' | 'comment' | 'cdata' | 'doctype' | 'instruction' | 'gap'

export type XmlToken = {
  kind: XmlTokenKind
  /** The source text of the token, exactly as written. */
  raw: string
  /** The tag name, attribute text or comment body, depending on the kind. */
  content: string
  /** Character offset of the token in the source. */
  at: number
  /** Nesting depth; a token inside an element is one deeper than it. */
  depth: number
}

export type XmlFormatResult = {
  ok: true
  tokens: XmlToken[]
  formatted: string
  minified: string
  elementCount: number
  attributeCount: number
  maxDepth: number
  /** Whitespace the formatter added or removed, for the page's stat row. */
  changedBytes: number
}

export type XmlResult = { ok: true } & XmlFormatResult | { ok: false; code: XmlErrorCode; position?: number }

export const xmlIndentOptions = ['  ', '    ', '\t'] as const

/** Names that may not have a closing tag, per the XML spec. */
const voidNames = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

const doctypePattern = /^\s*<!DOCTYPE[\s\S]*?(?:\[[\s\S]*?\])?\s*>/i

/** True when a tag closes itself, which `name/` and the HTML-style list both do. */
function isSelfClosing(raw: string) {
  return raw.endsWith('/>') || (raw.startsWith('<') && !raw.startsWith('</') && raw.endsWith('>') && voidNames.has(tagName(raw)))
}

function tagName(raw: string) {
  const match = /^<\/?\s*([^\s/>]+)/.exec(raw)
  return match ? match[1] : ''
}

/**
 * Splits a tag into its name and its attributes.
 *
 * Written by hand rather than with a regular expression because attribute values may
 * contain `>`, which is legal XML and which `<[^>]+>` cannot see past.
 */
function readAttributes(raw: string): { name: string; attrs: { name: string; value: string }[] } {
  const match = /^<([^\s/>]+)/.exec(raw)
  const name = match ? match[1] : ''
  const body = raw.slice(name.length + 1).replace(/\/?>$/, '')
  const attrs: { name: string; value: string }[] = []
  let index = 0
  while (index < body.length) {
    while (index < body.length && /\s/.test(body[index])) index += 1
    if (index >= body.length) break
    const start = index
    while (index < body.length && !/[\s=]/.test(body[index])) index += 1
    const attrName = body.slice(start, index)
    while (index < body.length && /\s/.test(body[index])) index += 1
    if (body[index] !== '=') {
      // A valueless attribute is XML's boolean form, and legal in no DTD but seen
      // often enough to be worth keeping rather than rejecting.
      if (attrName) attrs.push({ name: attrName, value: '' })
      continue
    }
    index += 1
    while (index < body.length && /\s/.test(body[index])) index += 1
    const quote = body[index]
    if (quote === '"' || quote === "'") {
      index += 1
      const valueStart = index
      while (index < body.length && body[index] !== quote) index += 1
      attrs.push({ name: attrName, value: body.slice(valueStart, index) })
      index += 1
      continue
    }
    const valueStart = index
    while (index < body.length && !/\s/.test(body[index])) index += 1
    attrs.push({ name: attrName, value: body.slice(valueStart, index) })
  }
  return { name, attrs }
}

type Scan = { tokens: XmlToken[] } | { error: XmlErrorCode; position: number }

/** Splits the document into tokens, tracking depth so the formatter can indent. */
function scan(source: string): Scan {
  const tokens: XmlToken[] = []
  const stack: string[] = []
  let index = 0
  let textStart = 0
  let depth = 0

  const flushText = (end: number) => {
    if (end <= textStart) return
    tokens.push({ kind: 'text', raw: source.slice(textStart, end), content: source.slice(textStart, end), at: textStart, depth })
  }

  while (index < source.length) {
    if (source[index] !== '<') {
      index += 1
      continue
    }
    flushText(index)
    const at = index

    if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4)
      if (close < 0) return { error: 'unclosedComment', position: at }
      const raw = source.slice(index, close + 3)
      tokens.push({ kind: 'comment', raw, content: raw.slice(4, -3), at, depth })
      index = close + 3
      textStart = index
      continue
    }

    if (source.startsWith('<![CDATA[', index)) {
      const close = source.indexOf(']]>', index + 9)
      if (close < 0) return { error: 'unclosedTag', position: at }
      const raw = source.slice(index, close + 3)
      tokens.push({ kind: 'cdata', raw, content: raw.slice(9, -3), at, depth })
      index = close + 3
      textStart = index
      continue
    }

    if (source.startsWith('<!', index)) {
      const match = doctypePattern.exec(source.slice(index))
      if (!match) return { error: 'unclosedTag', position: at }
      const raw = match[0].trim()
      tokens.push({ kind: 'doctype', raw, content: raw.slice(9, -1).trim(), at, depth })
      index = at + raw.length
      textStart = index
      continue
    }

    if (source.startsWith('<?', index)) {
      const close = source.indexOf('?>', index + 2)
      if (close < 0) return { error: 'unclosedTag', position: at }
      const raw = source.slice(index, close + 2)
      tokens.push({ kind: 'instruction', raw, content: raw.replace(/^<\?|\?>$/g, '').trim(), at, depth })
      index = close + 2
      textStart = index
      continue
    }

    if (source.startsWith('</', index)) {
      const close = source.indexOf('>', index)
      if (close < 0) return { error: 'unclosedTag', position: at }
      const raw = source.slice(index, close + 1)
      const name = tagName(raw)
      const open = stack.pop()
      if (open === undefined) return { error: 'strayClose', position: at }
      if (open !== name) return { error: 'mismatchedTag', position: at }
      depth -= 1
      tokens.push({ kind: 'close', raw, content: name, at, depth })
      index = close + 1
      textStart = index
      continue
    }

    // An opening tag: scan past attributes, honouring quoted values.
    let cursor = index + 1
    let quote: string | null = null
    while (cursor < source.length) {
      const character = source[cursor]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
      cursor += 1
    }
    if (cursor >= source.length) return { error: 'unclosedTag', position: at }
    const raw = source.slice(index, cursor + 1)
    const { name, attrs } = readAttributes(raw)
    if (!name) return { error: 'badAttribute', position: at }

    const selfClosing = isSelfClosing(raw)
    tokens.push({
      kind: selfClosing ? 'selfClosing' : 'open',
      raw,
      content: selfClosing ? '' : raw.slice(name.length + 1).replace(/>$/, '').trim(),
      at,
      depth
    })
    // `attrs` is parsed for the attribute count below; the token keeps its source
    // text, because rewriting an attribute would mean guessing at its quoting.
    void attrs
    if (!selfClosing) {
      stack.push(name)
      depth += 1
    }
    index = cursor + 1
    textStart = index
  }

  flushText(source.length)
  if (stack.length > 0) return { error: 'unclosedTag', position: source.length }
  return { tokens }
}

const escapeText = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Whitespace-only text between tags carries no meaning, so it is dropped. */
function isGap(token: XmlToken) {
  return token.kind === 'text' && token.raw.trim() === ''
}

/**
 * Prints the token stream as an indented document.
 *
 * The rule is that an element with nothing but text in it stays on one line, and an
 * element with children in it breaks across lines. That is the whole difference
 * between `<title>The Long River</title>` and a title split over three lines, and it
 * is decided by looking at what is directly inside the element rather than by a
 * blanket rule about text.
 */
function printRange(tokens: XmlToken[], indent: string, minify: boolean): string[] {
  const out: string[] = []

  const matchingClose = (from: number): number => {
    let depth = 0
    for (let index = from; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (token.kind === 'open') depth += 1
      else if (token.kind === 'close') {
        depth -= 1
        if (depth === 0) return index
      }
    }
    return tokens.length
  }

  const hasElementChild = (from: number, to: number) => {
    let depth = 0
    for (let index = from + 1; index < to; index += 1) {
      const token = tokens[index]
      if (token.kind === 'open') {
        if (depth === 0) return true
        depth += 1
      } else if (token.kind === 'close') depth -= 1
      else if (token.kind === 'selfClosing' && depth === 0) return true
    }
    return false
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const at = indent.repeat(token.depth)

    if (minify) {
      if (isGap(token)) continue
      out.push(token.raw.trim())
      continue
    }

    if (token.kind === 'open') {
      const close = matchingClose(index)
      if (!hasElementChild(index, close)) {
        // Leaf element: the text between the tags belongs on the same line.
        const inner = tokens
          .slice(index + 1, close)
          .filter((part) => !isGap(part))
          .map((part) => (part.kind === 'text' ? escapeText(part.raw) : part.raw.trim()))
          .join(minify ? '' : ' ')
        const closing = close < tokens.length ? tokens[close].raw.trim() : ''
        out.push(`${at}${token.raw.trim()}${inner}${closing}`)
        index = close
        continue
      }
      // The recursion keeps absolute depths, so no extra indent is added here.
      out.push(`${at}${token.raw.trim()}`)
      for (const line of printRange(tokens.slice(index + 1, close), indent, false)) out.push(line)
      out.push(`${at}${tokens[close]?.raw.trim() ?? ''}`)
      index = close
      continue
    }

    if (token.kind === 'text') {
      const text = escapeText(token.raw)
      if (text !== '') out.push(`${at}${text}`)
      continue
    }

    if (token.kind === 'close') continue
    out.push(`${at}${token.raw.trim()}`)
  }
  return out
}

function render(tokens: XmlToken[], indent: string, minify: boolean): string {
  return printRange(tokens, indent, minify).join(minify ? '' : '\n')
}

export function formatXml(source: string, indent = '  '): XmlResult {
  if (source.trim() === '') return { ok: false, code: 'empty' }
  const scanned = scan(source)
  if ('error' in scanned) return { ok: false, code: scanned.error, position: scanned.position }

  const declaration = scanned.tokens.find((token) => token.kind === 'instruction' && /^xml\s/.test(token.content))
  const body = declaration ? scanned.tokens.slice(scanned.tokens.indexOf(declaration) + 1) : scanned.tokens

  const formatted = render(scanned.tokens, indent, false)
  const minified = render(scanned.tokens, '', true)
  const attributeCount = scanned.tokens.reduce((total, token) => {
    if (token.kind !== 'open' && token.kind !== 'selfClosing') return total
    return total + readAttributes(token.raw).attrs.length
  }, 0)

  return {
    ok: true,
    tokens: body,
    formatted: `${formatted}\n`,
    minified: minified.endsWith('\n') ? minified : `${minified}\n`,
    elementCount: scanned.tokens.filter((token) => token.kind === 'open' || token.kind === 'selfClosing').length,
    attributeCount,
    maxDepth: scanned.tokens.reduce((deepest, token) => Math.max(deepest, token.depth), 0),
    changedBytes: Math.abs(formatted.length - source.length)
  }
}

/** A small document that shows every token kind at once. */
export const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a library catalogue -->
<library name="Riverside" opened="2004">
<book id="b1" lang="en"><title>The Long River</title><tags><tag>water</tag><tag>geography</tag></tags></book>
<book id="b2" lang="fr"><title>Le Fleuve</title><price currency="EUR">24.50</price><note><![CDATA[ <not markup> & "quoted" ]]></note></book>
<empty/>
</library>`