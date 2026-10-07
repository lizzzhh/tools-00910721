/**
 * YAML reading and writing.
 *
 * The reader covers the subset that configuration files are actually made of:
 * block mappings and sequences, flow collections, single and double quoted scalars,
 * block scalars (`|` and `>`), comments, anchors and aliases, and multiple
 * documents. Constructs it does not read are reported rather than guessed at,
 * because a formatter that silently drops a tag or a merge key has destroyed
 * something the reader cannot get back.
 *
 * Formatting is line-based rather than tree-based. Going through the parsed value
 * would throw away every comment in the file, which is most of why a `.yml` file
 * was edited by hand in the first place. Re-indenting the lines keeps the text and
 * only fixes what is wrong with it.
 */

export type YamlErrorCode =
  | 'empty'
  | 'tabIndent'
  | 'badIndent'
  | 'unclosedQuote'
  | 'unclosedFlow'
  | 'duplicateKey'
  | 'badStructure'
  | 'badScalar'
  | 'unknownAnchor'
  | 'unsupported'

export type YamlError = {
  code: YamlErrorCode
  /** One-based line, which is what an editor can put a cursor on. */
  line: number
  message?: string
}

export type YamlParseResult =
  | { ok: true; value: unknown; documents: number; comments: number; anchors: string[]; errors: YamlError[] }
  | { ok: false; code: YamlErrorCode; line: number; errors: YamlError[] }

export type YamlFormatOptions = {
  indent?: number
  /** Keep blank lines between blocks, which is what a person typed on purpose. */
  keepBlankLines?: boolean
  /** Drop comments instead of moving them. */
  stripComments?: boolean
}

export type YamlFormatResult = {
  ok: boolean
  formatted: string
  errors: YamlError[]
  lines: number
  keys: number
  comments: number
  documents: number
}

type Line = {
  number: number
  /** Indent width in columns. */
  indent: number
  text: string
  raw: string
  blank: boolean
  comment: boolean
}

/** Splits into lines and measures each one, which everything else works from. */
function readLines(source: string): Line[] {
  return source.replace(/\r\n?/g, '\n').split('\n').map((raw, position) => {
    const withoutTab = raw
    const trimmedStart = withoutTab.replace(/^[ \t]*/, '')
    const indentText = withoutTab.slice(0, withoutTab.length - trimmedStart.length)
    const text = trimmedStart.replace(/\s+$/, '')
    return {
      number: position + 1,
      indent: indentText.length,
      text,
      raw,
      blank: text === '',
      comment: text.startsWith('#')
    }
  })
}

/** Finds the `#` that starts a comment: outside quotes, and preceded by space or line start. */
function commentAt(text: string) {
  let quote: string | null = null
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (character === '\\' && quote === '"') index += 1
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '#' && (index === 0 || /\s/.test(text[index - 1]))) return index
  }
  return -1
}

const splitComment = (text: string) => {
  const at = commentAt(text)
  return { body: at === -1 ? text : text.slice(0, at).trimEnd(), comment: at === -1 ? '' : text.slice(at).trimEnd() }
}

/** Strips the quotes off a scalar and interprets the escape sequences in it. */
export function parseScalar(raw: string): { ok: true; value: unknown } | { ok: false; code: YamlErrorCode } {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  if (text === '~' || text === 'null' || text === 'Null' || text === 'NULL') return { ok: true, value: null }
  if (text === 'true' || text === 'True' || text === 'TRUE' || text === 'yes' || text === 'on') return { ok: true, value: true }
  if (text === 'false' || text === 'False' || text === 'FALSE' || text === 'no' || text === 'off') return { ok: true, value: false }
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) return { ok: false, code: 'unclosedQuote' }
    try {
      return { ok: true, value: JSON.parse(text) as unknown }
    } catch {
      return { ok: false, code: 'badScalar' }
    }
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) return { ok: false, code: 'unclosedQuote' }
    return { ok: true, value: text.slice(1, -1).replace(/''/g, "'") }
  }
  if (text.startsWith('[') || text.startsWith('{')) return readFlow(text)
  if (/^[+-]?\d+$/.test(text)) return { ok: true, value: Number(text) }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(text)) return { ok: true, value: Number(text) }
  if (text === '.inf' || text === '.Inf' || text === '.INF') return { ok: true, value: Infinity }
  if (text === '-.inf' || text === '-.Inf' || text === '-.INF') return { ok: true, value: -Infinity }
  if (text === '.nan' || text === '.NaN' || text === '.NAN') return { ok: true, value: NaN }
  return { ok: true, value: text }
}

/**
 * Reads a flow collection, which has to be balanced and on one line.
 *
 * Written as a small recursive descent rather than a character scan with a stack:
 * a flow collection nests (`{a: [1, {b: 2}]}`), and the value has to come back out
 * in the shape it went in, which a stack of buffers does not give you for free.
 */
function readFlow(text: string): { ok: true; value: unknown } | { ok: false; code: YamlErrorCode } {
  let index = 0
  const skipSpace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1
  }

  const readQuoted = (quote: string): { ok: true; value: string } | { ok: false; code: YamlErrorCode } => {
    const start = index
    index += 1
    while (index < text.length) {
      if (text[index] === '\\' && quote === '"') {
        index += 2
        continue
      }
      if (text[index] === quote) {
        index += 1
        return { ok: true, value: text.slice(start, index) }
      }
      index += 1
    }
    return { ok: false, code: 'unclosedQuote' }
  }

  const readNode = (): { ok: true; value: unknown } | { ok: false; code: YamlErrorCode } => {
    skipSpace()
    const character = text[index]
    if (character === undefined) return { ok: false, code: 'unclosedFlow' }

    if (character === '{' || character === '[') {
      const isMap = character === '{'
      index += 1
      const container: unknown = isMap ? {} : []
      skipSpace()
      if (text[index] === (isMap ? '}' : ']')) {
        index += 1
        return { ok: true, value: container }
      }
      for (;;) {
        if (isMap) {
          const key = readNode()
          if (!key.ok) return key
          skipSpace()
          if (text[index] !== ':') return { ok: false, code: 'badStructure' }
          index += 1
          const value = readNode()
          if (!value.ok) return value
          ;(container as Record<string, unknown>)[String(key.value)] = value.value
        } else {
          const value = readNode()
          if (!value.ok) return value
          ;(container as unknown[]).push(value.value)
        }
        skipSpace()
        if (text[index] === ',') {
          index += 1
          skipSpace()
          if (text[index] === (isMap ? '}' : ']')) {
            index += 1
            return { ok: true, value: container }
          }
          continue
        }
        if (text[index] === (isMap ? '}' : ']')) {
          index += 1
          return { ok: true, value: container }
        }
        return { ok: false, code: 'unclosedFlow' }
      }
    }

    if (character === '"' || character === "'") {
      const quoted = readQuoted(character)
      if (!quoted.ok) return quoted
      return parseScalar(quoted.value)
    }

    const start = index
    while (index < text.length && !/[,\]}:]/.test(text[index])) {
      // A colon ends a plain scalar only when a space follows it, so `a:b` is a
      // key and `http://x` is a value.
      if (text[index] === ':' && /\s/.test(text[index + 1] ?? ' ')) break
      index += 1
    }
    const raw = text.slice(start, index).trim()
    if (raw === '') return { ok: false, code: 'badStructure' }
    return parseScalar(raw)
  }

  const result = readNode()
  if (!result.ok) return result
  skipSpace()
  if (index < text.length) return { ok: false, code: 'unclosedFlow' }
  return result
}

class Reader {
  readonly errors: YamlError[] = []
  readonly anchors = new Map<string, unknown>()
  /** Keys that arrived through a merge key and may still be overridden. */
  private readonly merged = new Set<string>()
  comments = 0
  documents = 0
  keys = 0

  private readonly lines: Line[]

  constructor(lines: Line[]) {
    this.lines = lines
  }

  /** `index` is a zero-based line offset; a reported line number is one-based. */
  private fail(code: YamlErrorCode, index: number) {
    const line = index + 1
    if (!this.errors.some((error) => error.code === code && error.line === line)) this.errors.push({ code, line })
  }

  /** Index of the next line with content, skipping blanks and comments. */
  private next(from: number, stopAt?: number) {
    for (let index = from; index < (stopAt ?? this.lines.length); index += 1) {
      const line = this.lines[index]
      if (line.blank) continue
      if (line.comment) {
        this.comments += 1
        continue
      }
      return index
    }
    return -1
  }

  readDocuments(): unknown[] {
    // A document starts at the first line or at a `---` marker, and ends at the
    // next one, so the ranges are found before anything is parsed.
    const starts: number[] = []
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines[index]
      if (line.text.startsWith('---') && (line.text.length === 3 || /^---\s/.test(line.text))) starts.push(index)
      else if (index === 0) starts.push(0)
    }
    if (starts.length === 0) starts.push(0)
    const documents: unknown[] = []
    starts.forEach((start, order) => {
      const end = starts[order + 1] ?? this.lines.length
      const bodyStart = this.lines[start]?.text.startsWith('---') ? this.next(start + 1, end) : this.next(start, end)
      this.documents += 1
      documents.push(bodyStart === -1 ? null : this.readBlock(bodyStart, end))
    })
    return documents
  }

  private lastIndex = 0

  /** Reads one node at `start`, whose children are the lines indented further than it. */
  readBlock(start: number, stopAt: number): unknown {
    if (start === -1 || start >= stopAt) return null
    this.lastIndex = start
    const line = this.lines[start]
    if (line.text.startsWith('- ') || line.text === '-') return this.readSequence(start, stopAt)
    return this.readMapping(start, stopAt)
  }

  private readSequence(start: number, stopAt: number): unknown[] {
    const base = this.lines[start].indent
    const items: unknown[] = []
    let index = start
    this.lastIndex = stopAt
    for (;;) {
      const found = this.next(index, stopAt)
      if (found === -1) break
      const line = this.lines[found]
      // Anything that is not a dash at this indentation ends the sequence. That is
      // how a sequence written at its parent key's level knows where it stops, and
      // reporting it as an error would make every such file unreadable.
      if (line.indent < base || !(line.text === '-' || line.text.startsWith('- '))) {
        this.lastIndex = found
        break
      }
      if (line.indent > base) {
        this.fail('badIndent', found)
        index = found + 1
        continue
      }
      const rest = line.text === '-' ? '' : line.text.slice(2).trim()
      this.lastIndex = found + 1
      if (rest === '') {
        const child = this.next(found + 1, stopAt)
        if (child !== -1 && this.lines[child].indent > base) items.push(this.readBlock(child, stopAt))
        else items.push(null)
        index = Math.max(this.lastIndex, found + 1)
        continue
      }
      // `- key: value` starts a mapping on the same line as the dash, so its
      // indentation is the dash's plus the width of `- `.
      const inline = this.lines[found].indent + 2
      if (this.looksLikeKey(rest)) {
        const nested: Line[] = [
          { ...this.lines[found], indent: inline, text: rest, raw: `${' '.repeat(inline)}${rest}` }
        ]
        const following = this.next(found + 1, stopAt)
        if (following !== -1 && this.lines[following].indent > base) {
          for (let scan = found + 1; scan < stopAt; scan += 1) {
            if (this.lines[scan].blank) continue
            if (this.lines[scan].comment) {
              nested.push(this.lines[scan])
              continue
            }
            nested.push({ ...this.lines[scan], indent: this.lines[scan].indent - base + inline })
            break
          }
        }
        const reader = new Reader(nested)
        items.push(reader.readBlock(0, nested.length))
        for (const error of reader.errors) this.errors.push(error)
        index = found + 1
        continue
      }
      items.push(this.readValue(rest, found))
      index = found + 1
    }
    return items
  }

  private readMapping(start: number, stopAt: number): Record<string, unknown> {
    const base = this.lines[start].indent
    const map: Record<string, unknown> = {}
    let index = start
    this.lastIndex = stopAt
    while (index < stopAt) {
      const found = this.next(index, stopAt)
      if (found === -1) break
      const line = this.lines[found]
      if (line.indent < base) break
      if (line.text.startsWith('...')) break
      if (line.indent > base) {
        this.fail('badIndent', found)
        index = found + 1
        continue
      }
      if (line.text.startsWith('- ')) break

      const split = splitComment(line.text)
      const colon = this.keyColon(split.body)
      if (colon === -1) {
        this.fail('badStructure', found)
        index = found + 1
        continue
      }
      const rawKey = split.body.slice(0, colon).trim()
      const key = rawKey.replace(/^["']|["']$/g, '')
      if (key === '') {
        this.fail('badStructure', found)
        index = found + 1
        continue
      }
      const rest = split.body.slice(colon + 1).trim()
      this.lastIndex = found + 1

      // `defaults: &shared` on its own line names the block underneath it, so the
      // anchor is not the value: reading it as one would leave the block orphaned.
      const anchorOnly = /^&(\S+)$/.exec(rest)
      if (rest === '' || anchorOnly) {
        const child = this.next(found + 1, stopAt)
        if (child !== -1 && this.lines[child].indent > base) {
          this.assign(map, key, this.readBlock(child, stopAt), found)
        } else if (child !== -1 && this.lines[child].indent === base && this.lines[child].text.startsWith('-')) {
          // A sequence may sit at the same indentation as the key it belongs to,
          // which is valid YAML and the most common way it is written.
          this.assign(map, key, this.readSequence(child, stopAt), found)
        } else {
          this.assign(map, key, null, found)
        }
        if (anchorOnly) this.anchors.set(anchorOnly[1], map[key])
        index = this.lastIndex
        continue
      }

      if (rest === '|' || rest === '>' || /^[|>][-+]?\d*$/.test(rest)) {
        this.assign(map, key, this.readBlockScalar(rest, found + 1, base, stopAt), found)
        index = this.lastIndex
        continue
      }

      this.assign(map, key, this.readValue(rest, this.lines[found].number), found)
      index = found + 1
    }
    return map
  }

  /**
   * Writes one `key: value` pair into a mapping.
   *
   * `<<` is a merge key rather than a key of its own: it folds the maps it points
   * at into this one, and keys written here already win over the merged ones.
   */
  private assign(map: Record<string, unknown>, key: string, value: unknown, index: number): number {
    if (key === '<<') {
      for (const source of Array.isArray(value) ? value : [value]) {
        if (source === null || typeof source !== 'object' || Array.isArray(source)) {
          this.fail('badStructure', index)
          continue
        }
        for (const [from, into] of Object.entries(source)) {
          if (from in map) continue
          map[from] = into
          this.merged.add(from)
        }
      }
      return this.keys
    }
    // A key that arrived through a merge may be written again to override it,
    // which is the whole point of a merge key and not a duplicate.
    if (this.merged.delete(key)) map[key] = value
    else if (Object.prototype.hasOwnProperty.call(map, key)) this.fail('duplicateKey', index)
    else map[key] = value
    this.keys += 1
    return this.keys
  }

  /** The colon that separates a key from its value, skipping the ones inside quotes. */
  private keyColon(text: string) {
    let quote: string | null = null
    let depth = 0
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (quote) {
        if (character === '\\' && quote === '"') index += 1
        else if (character === quote) quote = null
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        continue
      }
      if (character === '[' || character === '{') depth += 1
      else if (character === ']' || character === '}') depth -= 1
      else if (character === '#' && index > 0 && /\s/.test(text[index - 1])) return -1
      else if (character === ':' && depth === 0) {
        if (index === text.length - 1 || /\s/.test(text[index + 1])) return index
      }
    }
    return -1
  }

  private looksLikeKey(text: string) {
    return this.keyColon(text) !== -1
  }

  /** Handles the prefix forms a value can carry: an anchor, a tag, or an alias. */
  private readValue(rest: string, line: number): unknown {
    // `line` is one-based, because that is what the caller has.
    let text = rest
    let alias = ''
    if (text.startsWith('*')) {
      const name = text.slice(1).replace(/\s+#.*$/, '').trim()
      if (!this.anchors.has(name)) this.fail('unknownAnchor', line - 1)
      alias = name
      return this.anchors.get(name) ?? null
    }
    const anchorMatch = /^&(\S+)\s*/.exec(text)
    if (anchorMatch) text = text.slice(anchorMatch[0].length)
    const tagMatch = /^(!!?[\w./-]*)\s+/.exec(text)
    if (tagMatch) {
      this.fail('unsupported', line - 1)
      text = text.slice(tagMatch[0].length)
    }
    const scalar = parseScalar(text)
    if (!scalar.ok) {
      this.fail(scalar.code, line - 1)
      return text
    }
    const anchorName = alias || anchorMatch?.[1]
    if (anchorName) this.anchors.set(anchorName, scalar.value)
    return scalar.value
  }

  /** Collects the lines of a `|` or `>` block, honouring chomping and folding. */
  private readBlockScalar(header: string, from: number, base: number, stopAt: number): string {
    const folded = header.startsWith('>')
    const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip'
    const collected: string[] = []
    let index = from
    let blockIndent = -1
    while (index < stopAt) {
      const line = this.lines[index]
      if (line.blank) {
        collected.push('')
        index += 1
        continue
      }
      if (line.indent <= base) break
      if (blockIndent === -1) blockIndent = line.indent
      collected.push(line.raw.slice(blockIndent))
      index += 1
    }
    this.lastIndex = index
    while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop()
    const body = folded ? foldLines(collected) : collected.join('\n')
    if (chomp === 'strip') return body
    if (chomp === 'keep') return `${body}\n`
    return body === '' ? '' : `${body}\n`
  }
}

/** `>` joins the lines of a paragraph with spaces and keeps blank lines as breaks. */
function foldLines(lines: string[]) {
  let out = ''
  let previousWasText = false
  for (const line of lines) {
    if (line.trim() === '') {
      out += '\n'
      previousWasText = false
      continue
    }
    if (previousWasText) out += ' '
    out += line.trim()
    previousWasText = true
  }
  return out
}

export function parseYaml(source: string): YamlParseResult {
  if (source.trim() === '') return { ok: false, code: 'empty', line: 1, errors: [{ code: 'empty', line: 1 }] }
  const lines = readLines(source)
  const reader = new Reader(lines)
  const documents = reader.readDocuments()
  const errors = reader.errors
  // A tab in the indentation is never allowed, and it is the mistake that produces
  // the least obvious failure, so it is checked before anything else is believed.
  for (const line of lines) {
    if (line.raw.startsWith('\t') || /^[ ]*\t/.test(line.raw)) errors.push({ code: 'tabIndent', line: line.number })
  }
  const deduped = [...new Map(errors.map((error) => [`${error.code}:${error.line}`, error])).values()].sort((a, b) => a.line - b.line)
  if (deduped.length > 0) {
    const first = deduped[0]
    return { ok: false, code: first.code, line: first.line, errors: deduped }
  }
  return {
    ok: true,
    value: documents[0] ?? null,
    documents: Math.max(1, reader.documents),
    comments: reader.comments,
    anchors: [...reader.anchors.keys()],
    errors: []
  }
}

/**
 * Re-indents the source, keeping its text.
 *
 * The indent of each line is recomputed from the block structure the reader found,
 * so a file written with three spaces and one written with a tab come out the same.
 * Anything the reader could not make sense of is left exactly as it was rather than
 * guessed at.
 */
export function formatYaml(source: string, options: YamlFormatOptions = {}): YamlFormatResult {
  const width = options.indent ?? 2
  const parsed = parseYaml(source)
  const lines = readLines(source)
  const out: string[] = []
  /** Source indentation of each block that is still open. */
  const stack: number[] = []

  for (const line of lines) {
    if (line.blank) {
      if (options.keepBlankLines !== false && out.length > 0 && out[out.length - 1] !== '') out.push('')
      continue
    }
    if (line.text.startsWith('---') || line.text.startsWith('...')) {
      out.push(line.text)
      stack.length = 0
      continue
    }
    if (line.comment) {
      // A comment belongs to whatever block encloses it, so it is measured against
      // the same stack without opening a block of its own.
      if (options.stripComments) continue
      while (stack.length > 0 && line.indent < stack[stack.length - 1]) stack.pop()
      out.push(`${' '.repeat(stack.length * width)}${line.text}`)
      continue
    }

    while (stack.length > 0 && line.indent <= stack[stack.length - 1]) stack.pop()
    out.push(`${' '.repeat(stack.length * width)}${line.text}`)
    stack.push(line.indent)
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  const formatted = out.length === 0 ? '' : `${out.join('\n')}\n`
  return {
    ok: parsed.ok,
    formatted,
    errors: parsed.ok ? [] : parsed.errors,
    lines: lines.length,
    keys: parsed.ok ? countKeys(parsed.value) : 0,
    comments: lines.filter((line) => line.comment).length,
    documents: parsed.ok ? parsed.documents : countMarkers(lines)
  }
}

const countMarkers = (lines: Line[]) => Math.max(1, lines.filter((line) => line.text.startsWith('---')).length)

function countKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((total, item) => total + countKeys(item), 0)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<number>((total, [, item]) => total + 1 + countKeys(item), 0)
  }
  return 0
}

const needsQuotes = (value: string) =>
  value === '' ||
  /^[\s]|[\s]$/.test(value) ||
  /[:#\[\]{}&*!|>'"%@`,]/.test(value) ||
  /^(true|false|null|yes|no|on|off|~|-?\d)/i.test(value) ||
  value.includes(': ')

/** Quotes a string only when it would otherwise read as something else. */
export function quoteYamlString(value: string, style: 'plain' | 'single' | 'double' = 'plain') {
  if (style === 'double') return JSON.stringify(value)
  if (style === 'single') return `'${value.replace(/'/g, "''")}'`
  if (!needsQuotes(value)) return value
  return `'${value.replace(/'/g, "''")}'`
}

/** Writes a JavaScript value as YAML, used for the sample and for round trips. */
export function stringifyYaml(value: unknown, options: { indent?: number; style?: 'plain' | 'single' | 'double' } = {}): string {
  const width = options.indent ?? 2
  const style = options.style ?? 'plain'
  const pad = (depth: number) => ' '.repeat(depth * width)

  const write = (input: unknown, depth: number): string[] => {
    if (input === null || input === undefined) return ['null']
    if (typeof input === 'boolean') return [String(input)]
    if (typeof input === 'number') {
      if (Number.isNaN(input)) return ['.nan']
      if (input === Infinity) return ['.inf']
      if (input === -Infinity) return ['-.inf']
      return [String(input)]
    }
    if (typeof input === 'string') return [quoteYamlString(input, style)]
    if (Array.isArray(input)) {
      if (input.length === 0) return ['[]']
      return input.flatMap((item) => {
        if (item !== null && typeof item === 'object') {
          const nested = write(item, depth + 1)
          const [first, ...rest] = nested
          // The first key of a mapping goes on the dash's line, which is the form
          // a person would have written.
          return [`${pad(depth)}- ${first.trimStart()}`, ...rest]
        }
        return [`${pad(depth)}- ${write(item, depth + 1)[0]}`]
      })
    }
    const entries = Object.entries(input as Record<string, unknown>)
    if (entries.length === 0) return ['{}']
    return entries.flatMap(([key, item]) => {
      const name = quoteYamlString(key, style)
      if (item !== null && typeof item === 'object') {
        const nested = write(item, depth + 1)
        // `key: {}` reads better than a brace on the next line, and a child that
        // came out on one line fits after the colon.
        if (nested.length === 1 && /^[\[{]/.test(nested[0])) return [`${pad(depth)}${name}: ${nested[0]}`]
        return [`${pad(depth)}${name}:`, ...nested]
      }
      const scalar = Array.isArray(item) ? '[]' : write(item, depth + 1)[0]
      return [`${pad(depth)}${name}: ${scalar}`]
    })
  }

  return `${write(value, 0).join('\n')}\n`
}

/** A document that shows every construct the reader supports. */
export const yamlSample = `# a deployment
name: riverside
version: 1.4
replicas: 3
enabled: true
tags:
- api
- web
env:
  DATABASE_URL: "postgres://localhost:5432/app"
  timeout: 30
limits:
  cpu: 500m
  memory: 512Mi
script: |
  echo "starting"
  npm run start
notes: >
  A folded scalar joins
  its lines with spaces.
matrix: [[1, 2], [3, 4]]
inline: { a: 1, b: two }
empty:
defaults: &shared
  retries: 2
production:
  <<: *shared
  retries: 5
--- 
# a second document
kind: Service
apiVersion: v1`