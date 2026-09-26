export type JsonIndent = 2 | 4 | '\t'
export type JsonQuote = '"' | "'"
export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export type JsonStats = {
  type: JsonValueType
  bytes: number
  depth: number
  keys: number
  arrays: number
  values: number
}

export type JsonFailure = {
  ok: false
  message: string
  line: number
  column: number
}

export type JsonParseOptions = {
  relaxed?: boolean
  allowComments?: boolean
  allowSingleQuotes?: boolean
  allowUnquotedKeys?: boolean
  allowTrailingCommas?: boolean
  allowMissingCommas?: boolean
  allowMissingColons?: boolean
  allowUndefined?: boolean
}

export type JsonFormatOptions = JsonParseOptions & {
  indent?: JsonIndent
  sortKeys?: boolean
  quote?: JsonQuote
  escapeUnicode?: boolean
  trailingCommas?: boolean
  arrayLineBreaks?: boolean
}

export type JsonParseResult =
  | { ok: true; value: unknown; repairs: string[]; commentCount: number }
  | JsonFailure

export type JsonFormatResult =
  | { ok: true; value: unknown; output: string; stats: JsonStats; repairs: string[]; commentCount: number }
  | JsonFailure

type JsonRecord = Record<string, unknown>
type TokenKind = 'string' | 'number' | 'identifier' | 'punctuation' | 'eof'
type Token = {
  kind: TokenKind
  value: string | number | null
  raw: string
  start: number
  end: number
}
type NormalizedParseOptions = Required<JsonParseOptions>
type FormatSettings = {
  indent: JsonIndent
  sortKeys: boolean
  quote: JsonQuote
  escapeUnicode: boolean
  trailingCommas: boolean
  arrayLineBreaks: boolean
}
type ParsedValue = { value: unknown; missing: boolean }

class JsonParserError extends Error {
  line: number
  column: number

  constructor(message: string, line: number, column: number) {
    super(message)
    this.name = 'JsonParserError'
    this.line = line
    this.column = column
  }
}

function locationAt(source: string, offset: number) {
  const before = source.slice(0, Math.max(0, Math.min(source.length, offset)))
  const lines = before.split(/\r\n|\r|\n/)
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

function isWhitespace(character: string) {
  return /\s/.test(character)
}

function isIdentifierStart(character: string) {
  return /[A-Za-z_$]/.test(character) || (character.codePointAt(0) ?? 0) > 127
}

function isIdentifierPart(character: string) {
  return isIdentifierStart(character) || /[0-9-]/.test(character)
}

function resolveParseOptions(options: JsonParseOptions, defaultRelaxed: boolean): NormalizedParseOptions {
  const relaxed = options.relaxed ?? defaultRelaxed
  return {
    relaxed,
    allowComments: options.allowComments ?? relaxed,
    allowSingleQuotes: options.allowSingleQuotes ?? relaxed,
    allowUnquotedKeys: options.allowUnquotedKeys ?? relaxed,
    allowTrailingCommas: options.allowTrailingCommas ?? relaxed,
    allowMissingCommas: options.allowMissingCommas ?? relaxed,
    allowMissingColons: options.allowMissingColons ?? relaxed,
    allowUndefined: options.allowUndefined ?? relaxed
  }
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value)
}

function readString(source: string, start: number, quote: string, options: NormalizedParseOptions, repairs: string[]) {
  let index = start + 1
  let value = ''

  while (index < source.length) {
    const character = source[index]
    if (character === quote) {
      return { value, end: index + 1 }
    }

    if (character === '\\') {
      index += 1
      if (index >= source.length) break
      const escaped = source[index]
      const simpleEscapes: Record<string, string> = {
        '"': '"',
        "'": "'",
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v'
      }
      if (escaped === 'u') {
        const hex = source.slice(index + 1, index + 5)
        if (/^[0-9a-f]{4}$/i.test(hex)) {
          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 5
          continue
        }
        if (!options.relaxed) {
          const location = locationAt(source, index - 1)
          throw new JsonParserError('字符串中的 Unicode 转义无效', location.line, location.column)
        }
        addUnique(repairs, '修复了无效的 Unicode 转义')
        value += 'u'
        index += 1
        continue
      }
      if (escaped in simpleEscapes) {
        value += simpleEscapes[escaped]
        index += 1
        continue
      }
      if (!options.relaxed) {
        const location = locationAt(source, index - 1)
        throw new JsonParserError('字符串包含无效的转义字符', location.line, location.column)
      }
      addUnique(repairs, '移除了无法识别的转义字符')
      value += escaped
      index += 1
      continue
    }

    if (character !== '\n' && character !== '\r' && character.charCodeAt(0) < 0x20) {
      if (!options.relaxed) {
        const location = locationAt(source, index)
        throw new JsonParserError('字符串包含未转义的控制字符', location.line, location.column)
      }
      addUnique(repairs, '替换了字符串中的未转义控制字符')
      value += ' '
      index += 1
      continue
    }

    if (character === '\n' || character === '\r') {
      if (!options.relaxed) {
        const location = locationAt(source, index)
        throw new JsonParserError('字符串不能直接包含换行', location.line, location.column)
      }
      addUnique(repairs, '将字符串中的换行替换为空格')
      value += ' '
      index += character === '\r' && source[index + 1] === '\n' ? 2 : 1
      continue
    }

    value += character
    index += 1
  }

  if (!options.relaxed) {
    const location = locationAt(source, start)
    throw new JsonParserError('字符串缺少结束引号', location.line, location.column)
  }
  addUnique(repairs, '为未闭合的字符串补上了结束引号')
  return { value, end: source.length }
}

function readNumber(source: string, start: number, options: NormalizedParseOptions, repairs: string[]) {
  const pattern = options.relaxed
    ? /[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/y
    : /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
  pattern.lastIndex = start
  const match = pattern.exec(source)
  if (!match) {
    const location = locationAt(source, start)
    throw new JsonParserError('数字格式无效', location.line, location.column)
  }
  const raw = match[0]
  const value = Number(raw)
  if (!Number.isFinite(value) && options.relaxed) {
    addUnique(repairs, '将非有限数字转换为 null')
    return { value: null, end: start + raw.length, raw }
  }
  return { value, end: start + raw.length, raw }
}

function tokenize(source: string, options: NormalizedParseOptions) {
  const tokens: Token[] = []
  const repairs: string[] = []
  let commentCount = 0
  let index = 0

  while (index < source.length) {
    const character = source[index]
    if (isWhitespace(character)) {
      index += 1
      continue
    }

    if (character === '/' && source[index + 1] === '/') {
      if (!options.allowComments) {
        const location = locationAt(source, index)
        throw new JsonParserError('严格 JSON 不允许注释', location.line, location.column)
      }
      commentCount += 1
      index += 2
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1
      continue
    }

    if (character === '/' && source[index + 1] === '*') {
      if (!options.allowComments) {
        const location = locationAt(source, index)
        throw new JsonParserError('严格 JSON 不允许注释', location.line, location.column)
      }
      commentCount += 1
      const end = source.indexOf('*/', index + 2)
      if (end < 0) {
        if (!options.relaxed) {
          const location = locationAt(source, index)
          throw new JsonParserError('块注释缺少结束标记', location.line, location.column)
        }
        addUnique(repairs, '为未闭合的块注释补上了结束标记')
        index = source.length
      } else {
        index = end + 2
      }
      continue
    }

    if (character === '"' || character === "'") {
      if (character === "'" && !options.allowSingleQuotes) {
        const location = locationAt(source, index)
        throw new JsonParserError('严格 JSON 不允许单引号', location.line, location.column)
      }
      const result = readString(source, index, character, options, repairs)
      tokens.push({ kind: 'string', value: result.value, raw: source.slice(index, result.end), start: index, end: result.end })
      index = result.end
      continue
    }

    if (options.relaxed && (character === '+' || character === '-') && isIdentifierStart(source[index + 1] ?? '')) {
      const start = index
      index += 1
      while (index < source.length && isIdentifierPart(source[index])) index += source[index].codePointAt(0)! > 0xffff ? 2 : 1
      const raw = source.slice(start, index)
      tokens.push({ kind: 'identifier', value: raw, raw, start, end: index })
      continue
    }

    if (/\d/.test(character) || ((character === '-' || character === '+' || character === '.') && options.relaxed)) {
      const result = readNumber(source, index, options, repairs)
      tokens.push({ kind: 'number', value: result.value, raw: result.raw, start: index, end: index + result.raw.length })
      index = result.end
      continue
    }

    if (isIdentifierStart(character)) {
      const start = index
      index += character.codePointAt(0)! > 0xffff ? 2 : 1
      while (index < source.length && isIdentifierPart(source[index])) index += source[index].codePointAt(0)! > 0xffff ? 2 : 1
      const raw = source.slice(start, index)
      tokens.push({ kind: 'identifier', value: raw, raw, start, end: index })
      continue
    }

    if ('{}[]:,='.includes(character)) {
      tokens.push({ kind: 'punctuation', value: character, raw: character, start: index, end: index + 1 })
      index += 1
      continue
    }

    if (!options.relaxed) {
      const location = locationAt(source, index)
      throw new JsonParserError(`无法识别的字符 ${JSON.stringify(character)}`, location.line, location.column)
    }
    addUnique(repairs, '忽略了无法识别的字符')
    index += 1
  }

  tokens.push({ kind: 'eof', value: '', raw: '', start: source.length, end: source.length })
  return { tokens, repairs, commentCount }
}

class ValueParser {
  private index = 0
  private readonly repairs: string[]
  private readonly commentCount: number
  private readonly source: string
  private readonly options: NormalizedParseOptions

  constructor(source: string, tokens: Token[], repairs: string[], commentCount: number, options: NormalizedParseOptions) {
    this.source = source
    this.options = options
    this.repairs = [...repairs]
    this.commentCount = commentCount
    this.tokens = tokens
  }

  private readonly tokens: Token[]

  private current() {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]
  }

  private consume() {
    const token = this.current()
    if (token.kind !== 'eof') this.index += 1
    return token
  }

  private isPunctuation(value: string) {
    const token = this.current()
    return token.kind === 'punctuation' && token.value === value
  }

  private repair(message: string) {
    addUnique(this.repairs, message)
  }

  private fail(message: string, token = this.current()) {
    const location = locationAt(this.source, token.start)
    throw new JsonParserError(message, location.line, location.column)
  }

  parse() {
    const parsed = this.parseValue()
    if (parsed.missing) this.fail('JSON 内容不完整')
    while (this.current().kind !== 'eof') {
      if (!this.options.relaxed) this.fail('JSON 根值后存在多余内容')
      if (this.isPunctuation(',')) {
        this.repair('忽略了根值后的多余逗号')
        this.consume()
        continue
      }
      if (this.isPunctuation('}') || this.isPunctuation(']')) {
        this.repair('忽略了多余的闭合符号')
        this.consume()
        continue
      }
      this.repair('忽略了根值后的多余内容')
      this.consume()
    }
    return { value: parsed.value, repairs: this.repairs, commentCount: this.commentCount }
  }

  private parseValue(): ParsedValue {
    const token = this.current()
    if (token.kind === 'string' || token.kind === 'number') {
      this.consume()
      return { value: token.value, missing: false }
    }
    if (token.kind === 'identifier') {
      const normalized = String(token.value).toLowerCase()
      if (normalized === 'true' || normalized === 'false' || normalized === 'null') {
        this.consume()
        return { value: normalized === 'null' ? null : normalized === 'true', missing: false }
      }
      if (this.options.allowUndefined && (normalized === 'undefined' || normalized === 'nan' || normalized === 'infinity' || normalized === '-infinity')) {
        this.repair(`将 ${token.value} 转换为 null`)
        this.consume()
        return { value: null, missing: false }
      }
      if (!this.options.relaxed) this.fail(`无法识别的值 ${token.raw}`)
      this.repair(`将无法识别的值 ${token.raw} 转换为 null`)
      this.consume()
      return { value: null, missing: false }
    }
    if (this.isPunctuation('{')) return { value: this.parseObject(), missing: false }
    if (this.isPunctuation('[')) return { value: this.parseArray(), missing: false }
    if (this.isPunctuation('}') || this.isPunctuation(']') || this.isPunctuation(',') || this.isPunctuation(':') || token.kind === 'eof') {
      return { value: null, missing: true }
    }
    this.repair('将缺失的值转换为 null')
    this.consume()
    return { value: null, missing: false }
  }

  private readObjectKey() {
    const token = this.current()
    if (token.kind === 'string') {
      this.consume()
      return String(token.value)
    }
    if (this.options.allowUnquotedKeys && (token.kind === 'identifier' || token.kind === 'number')) {
      this.consume()
      return token.raw
    }
    return null
  }

  private parseObject() {
    this.consume()
    const object = {} as JsonRecord
    if (this.isPunctuation('}')) {
      this.consume()
      return object
    }

    let iterations = 0
    while (this.current().kind !== 'eof') {
      iterations += 1
      if (iterations > this.tokens.length * 2 + 8) this.fail('对象结构无法恢复')
      if (this.isPunctuation('}')) {
        this.consume()
        return object
      }
      if (this.isPunctuation(']')) {
        if (!this.options.relaxed) this.fail('对象中出现错误的闭合符号')
        this.repair('为对象补上了右花括号')
        return object
      }
      if (this.isPunctuation(',')) {
        this.repair('忽略了对象中的多余逗号')
        this.consume()
        if (this.isPunctuation('}')) {
          if (!this.options.allowTrailingCommas) this.fail('对象不允许尾逗号')
          this.repair('移除了对象中的尾逗号')
          this.consume()
          return object
        }
        continue
      }

      const keyToken = this.current()
      const key = this.readObjectKey()
      if (key === null) {
        const unsupportedUnquotedKey = (keyToken.kind === 'identifier' || keyToken.kind === 'number') && !this.options.allowUnquotedKeys
        if (!this.options.relaxed || unsupportedUnquotedKey) this.fail('对象键必须使用字符串')
        this.repair('忽略了对象中无法识别的键')
        this.consume()
        continue
      }

      if (this.isPunctuation(':')) {
        this.consume()
      } else if (this.isPunctuation('=')) {
        if (!this.options.allowMissingColons) this.fail('对象键使用了等号但未启用修复')
        this.consume()
        this.repair('为对象键补上了冒号')
      } else if (!this.options.allowMissingColons) {
        this.fail('对象键后缺少冒号')
      } else {
        this.repair('为对象键补上了冒号')
      }

      const value = this.parseValue()
      if (value.missing) {
        if (!this.options.relaxed) this.fail('对象属性缺少值')
        this.repair('将对象中的缺失值转换为 null')
      }
      if (Object.prototype.hasOwnProperty.call(object, key)) this.repair(`对象中的重复键 ${key} 只保留最后一个值`)
      Object.defineProperty(object, key, { value: value.value, writable: true, enumerable: true, configurable: true })

      if (this.isPunctuation('}')) {
        this.consume()
        return object
      }
      if (this.isPunctuation(']') || this.current().kind === 'eof') {
        if (!this.options.relaxed) this.fail('对象缺少右花括号')
        this.repair('为对象补上了右花括号')
        return object
      }
      if (this.isPunctuation(',')) {
        this.consume()
        if (this.isPunctuation('}')) {
          if (!this.options.allowTrailingCommas) this.fail('对象不允许尾逗号')
          this.repair('移除了对象中的尾逗号')
          this.consume()
          return object
        }
        continue
      }
      if (!this.options.allowMissingCommas) this.fail('对象属性之间缺少逗号')
      this.repair('为对象属性补上了逗号')
    }

    if (!this.options.relaxed) this.fail('对象缺少右花括号')
    this.repair('为对象补上了右花括号')
    return object
  }

  private parseArray() {
    this.consume()
    const values: unknown[] = []
    if (this.isPunctuation(']')) {
      this.consume()
      return values
    }

    let iterations = 0
    while (this.current().kind !== 'eof') {
      iterations += 1
      if (iterations > this.tokens.length * 2 + 8) this.fail('数组结构无法恢复')
      if (this.isPunctuation(']')) {
        this.consume()
        return values
      }
      if (this.isPunctuation('}') || this.isPunctuation(':')) {
        if (!this.options.relaxed) this.fail('数组中出现错误的闭合符号')
        this.repair('为数组补上了右方括号')
        return values
      }
      if (this.isPunctuation(',')) {
        if (!this.options.relaxed) this.fail('数组中不允许空项')
        this.repair('将数组空项转换为 null')
        values.push(null)
        this.consume()
        continue
      }

      const parsed = this.parseValue()
      if (parsed.missing) {
        if (!this.options.relaxed) this.fail('数组元素缺少值')
        this.repair('将数组空项转换为 null')
        values.push(null)
        if (this.isPunctuation(']')) {
          this.consume()
          return values
        }
        if (this.isPunctuation(',')) {
          this.consume()
          continue
        }
        continue
      }
      values.push(parsed.value)

      if (this.isPunctuation(']')) {
        this.consume()
        return values
      }
      if (this.isPunctuation('}') || this.current().kind === 'eof') {
        if (!this.options.relaxed) this.fail('数组缺少右方括号')
        this.repair('为数组补上了右方括号')
        return values
      }
      if (this.isPunctuation(',')) {
        this.consume()
        if (this.isPunctuation(']')) {
          if (!this.options.allowTrailingCommas) this.fail('数组不允许尾逗号')
          this.repair('移除了数组中的尾逗号')
          this.consume()
          return values
        }
        continue
      }
      if (!this.options.allowMissingCommas) this.fail('数组元素之间缺少逗号')
      this.repair('为数组元素补上了逗号')
    }

    if (!this.options.relaxed) this.fail('数组缺少右方括号')
    this.repair('为数组补上了右方括号')
    return values
  }
}

function parseSource(source: string, options: NormalizedParseOptions) {
  const lexed = tokenize(source, options)
  const parser = new ValueParser(source, lexed.tokens, lexed.repairs, lexed.commentCount, options)
  return parser.parse()
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getValueType(value: unknown): JsonValueType {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  return 'null'
}

function getByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function escapeString(value: string, quote: JsonQuote, escapeUnicode: boolean) {
  let result = quote
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const code = value.charCodeAt(index)
    if (character === '\\' || character === quote) {
      result += `\\${character}`
    } else if (character === '\b') result += '\\b'
    else if (character === '\f') result += '\\f'
    else if (character === '\n') result += '\\n'
    else if (character === '\r') result += '\\r'
    else if (character === '\t') result += '\\t'
    else if (code < 0x20) result += `\\u${code.toString(16).padStart(4, '0')}`
    else if (escapeUnicode && code > 0x7e) result += `\\u${code.toString(16).padStart(4, '0')}`
    else result += character
  }
  return `${result}${quote}`
}

function getIndentText(depth: number, indent: JsonIndent) {
  return typeof indent === 'number' ? ' '.repeat(depth * indent) : '\t'.repeat(depth)
}

function serializeValue(value: unknown, settings: FormatSettings, depth: number, compact: boolean): string {
  if (value === null || typeof value === 'undefined') return 'null'
  if (typeof value === 'string') return escapeString(value, settings.quote, settings.escapeUnicode)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const values = value.map((item) => serializeValue(item, settings, depth + 1, compact))
    const trailing = settings.trailingCommas ? ',' : ''
    if (compact) return `[${values.join(',')}${trailing}]`
    if (!settings.arrayLineBreaks) return `[${values.join(', ')}${trailing}]`
    const childIndent = getIndentText(depth + 1, settings.indent)
    const closingIndent = getIndentText(depth, settings.indent)
    return `[\n${childIndent}${values.join(`,\n${childIndent}`)}${trailing}\n${closingIndent}]`
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (settings.sortKeys) keys.sort()
    if (!keys.length) return '{}'
    const separator = compact ? ':' : ': '
    const entries = keys.map((key) => `${escapeString(key, settings.quote, settings.escapeUnicode)}${separator}${serializeValue(value[key], settings, depth + 1, compact)}`)
    const trailing = settings.trailingCommas ? ',' : ''
    if (compact) return `{${entries.join(',')}${trailing}}`
    const childIndent = getIndentText(depth + 1, settings.indent)
    const closingIndent = getIndentText(depth, settings.indent)
    return `{\n${childIndent}${entries.join(`,\n${childIndent}`)}${trailing}\n${closingIndent}}`
  }
  return 'null'
}

function normalizeFormatOptions(options: JsonFormatOptions): FormatSettings {
  return {
    indent: options.indent ?? 2,
    sortKeys: options.sortKeys ?? false,
    quote: options.quote === "'" ? "'" : '"',
    escapeUnicode: options.escapeUnicode ?? false,
    trailingCommas: options.trailingCommas ?? false,
    arrayLineBreaks: options.arrayLineBreaks ?? true
  }
}

function getSource(input: string) {
  return input.replace(/^\uFEFF/, '')
}

function toFailure(error: unknown): JsonFailure {
  if (error instanceof JsonParserError) return { ok: false, message: error.message, line: error.line, column: error.column }
  return { ok: false, message: error instanceof Error ? error.message : 'JSON 解析失败', line: 1, column: 1 }
}

export function parseJson(input: string, options: JsonParseOptions = {}): JsonParseResult {
  const source = getSource(input)
  if (!source.trim()) return { ok: false, message: '请输入 JSON 内容', line: 1, column: 1 }
  try {
    const parsed = parseSource(source, resolveParseOptions(options, false))
    return { ok: true, value: parsed.value, repairs: parsed.repairs, commentCount: parsed.commentCount }
  } catch (error) {
    return toFailure(error)
  }
}

export function getJsonStats(value: unknown, output?: string): JsonStats {
  const serialized = output ?? serializeValue(value, normalizeFormatOptions({}), 0, false)
  const stats: JsonStats = {
    type: getValueType(value),
    bytes: getByteLength(serialized),
    depth: 0,
    keys: 0,
    arrays: 0,
    values: 0
  }
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: Array.isArray(value) || isRecord(value) ? 1 : 0 }]

  while (stack.length) {
    const current = stack.pop()
    if (!current) break
    stats.values += 1
    stats.depth = Math.max(stats.depth, current.depth)
    if (Array.isArray(current.value)) {
      stats.arrays += 1
      current.value.forEach((item) => stack.push({ value: item, depth: current.depth + 1 }))
    } else if (isRecord(current.value)) {
      const record = current.value
      const keys = Object.keys(record)
      stats.keys += keys.length
      keys.forEach((key) => stack.push({ value: record[key], depth: current.depth + 1 }))
    }
  }
  return stats
}

function createFormatResult(input: string, options: JsonFormatOptions, compact: boolean): JsonFormatResult {
  const source = getSource(input)
  if (!source.trim()) return { ok: false, message: '请输入 JSON 内容', line: 1, column: 1 }
  const parseOptions = resolveParseOptions(options, true)
  try {
    const parsed = parseSource(source, parseOptions)
    const settings = normalizeFormatOptions(options)
    const output = serializeValue(parsed.value, settings, 0, compact)
    return {
      ok: true,
      value: parsed.value,
      output,
      stats: getJsonStats(parsed.value, output),
      repairs: parsed.repairs,
      commentCount: parsed.commentCount
    }
  } catch (error) {
    return toFailure(error)
  }
}

export function formatJson(input: string, options: JsonFormatOptions = {}): JsonFormatResult {
  return createFormatResult(input, options, false)
}

export function minifyJson(input: string, options: JsonFormatOptions = {}): JsonFormatResult {
  return createFormatResult(input, options, true)
}
