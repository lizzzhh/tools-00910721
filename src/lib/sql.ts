/**
 * A SQL formatter and a small amount of SQL reading, without a database.
 *
 * The formatter works on tokens rather than on lines, because the only way to know
 * that `from` is a keyword is to know it is not a string or a quoted name. Text
 * inside literals, comments and placeholders is carried through byte for byte, so
 * a statement that formats cleanly is still the statement that was written.
 *
 * The reader part is deliberately modest: it reports statements, the tables and
 * columns it can see, and the handful of problems that are decidable from the
 * text alone. It is a formatter page, not a query planner.
 */

export type SqlDialect = 'standard' | 'mysql' | 'postgresql' | 'sqlite'

export type SqlTokenKind =
  | 'keyword'
  | 'identifier'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'placeholder'
  | 'punctuation'

export type SqlToken = {
  kind: SqlTokenKind
  /** The token as written, except for keywords, whose case follows `keywordCase`. */
  text: string
  start: number
  end: number
  /** Zero-based offset of the line the token starts on, for readable issues. */
  line: number
}

export type SqlErrorCode =
  | 'empty'
  | 'unterminatedString'
  | 'unterminatedIdentifier'
  | 'unterminatedComment'
  | 'unbalancedParenthesis'
  | 'emptyStatement'

export type SqlError = { code: SqlErrorCode; message: string; line: number; column: number }

export type SqlStatementKind =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'create'
  | 'alter'
  | 'drop'
  | 'with'
  | 'explain'
  | 'other'

export type SqlStatement = {
  kind: SqlStatementKind
  /** Keywords that led, e.g. `INSERT INTO` or `CREATE TABLE`. */
  lead: string
  tables: string[]
  columns: string[]
  placeholders: string[]
  /** 1-based line the statement starts on, and 1-based line it ends on. */
  from: number
  to: number
}

export type SqlFormatOptions = {
  dialect?: SqlDialect
  /** Spaces per indent level. */
  indent?: number
  keywordCase?: 'upper' | 'lower' | 'preserve'
  identifierCase?: 'preserve' | 'lower'
  /** Put `AND` / `OR` at the start of the line instead of the end of the previous one. */
  logicalOperatorsOnNewLine?: boolean
  /** Where a comma goes when a list is wrapped. */
  commaStyle?: 'trailing' | 'leading'
  /** Break the select list, and any list at the top level, one item per line. */
  wrapLists?: boolean
  /** A blank line between statements. */
  linesBetweenQueries?: boolean
  /** Uppercase of nothing: keep every comment exactly as written. */
  keepComments?: boolean
}

export type SqlFormatResult = {
  ok: boolean
  sql: string
  errors: SqlError[]
  statements: SqlStatement[]
  stats: SqlStats
}

export type SqlStats = {
  statements: number
  linesIn: number
  linesOut: number
  charactersIn: number
  charactersOut: number
  keywords: number
  identifiers: number
  strings: number
  numbers: number
  comments: number
  placeholders: number
  tables: number
  columns: number
}

export const sqlDialects: { value: SqlDialect; hint: string }[] = [
  { value: 'standard', hint: 'ANSI SQL' },
  { value: 'mysql', hint: 'MySQL / MariaDB' },
  { value: 'postgresql', hint: 'PostgreSQL' },
  { value: 'sqlite', hint: 'SQLite' }
]

/**
 * Words the formatter uppercases and the clause detector knows about.
 *
 * It is a union of what the four dialects here call reserved, plus the handful of
 * non-reserved words that only appear in the grammar (`analyze`, `pragma`).
 * Words that are legal column names are left out on purpose: `at`, `key`, `name`
 * and `value` are identifiers far more often than they are syntax, and renaming
 * a caller's column because a formatter felt like it would be wrong.
 */
const KEYWORDS = new Set(
  `add all alter and any as asc auto_increment between by cascade case cast check column commit constraint
   create cross current current_date current_time current_timestamp current_user database default delete desc
   distinct drop else end exists explain false for foreign from full grant group having if ilike in index
   inner insert into is join key left like limit lock not null offset on or order outer over partition
   primary references release rename replace returning right rollback select set table then to transaction
   trigger truncate true union unique update using vacuum values view when where while with window work write
   begin cached natural rows unbounded range groups only first last filter preceding following
   analyze analyze_verbose pragma attach detach escape glob ignore conflict do nothing`
    .split(/\s+/)
    .filter(Boolean)
)

/** Clause heads that start their own line when they are not inside parentheses. */
const LEADING = new Set(
  `from where group having order limit offset union except intersect values set join inner left right full cross
   natural returning into with`
    .split(/\s+/)
    .filter(Boolean)
)

/** Multi-word heads, longest first, so `insert into` wins over `insert`. */
const PHRASES = [
  'insert into',
  'delete from',
  'left outer join',
  'right outer join',
  'full outer join',
  'inner join',
  'cross join',
  'natural join',
  'group by',
  'order by',
  'union all',
  'union distinct',
  'left join',
  'right join',
  'full join',
  'on conflict',
  'foreign key',
  'primary key',
  'create table',
  'create index',
  'create view',
  'alter table',
  'drop table',
  'union'
]

const LOGICAL = new Set(['and', 'or'])

const TYPE_WORDS = new Set([
  'int', 'integer', 'bigint', 'smallint', 'tinyint', 'serial', 'bigserial', 'text', 'varchar', 'char', 'boolean',
  'bool', 'date', 'time', 'timestamp', 'timestamptz', 'datetime', 'numeric', 'decimal', 'real', 'double', 'float',
  'json', 'jsonb', 'uuid', 'blob', 'bytea', 'money', 'interval'
])

const OPERATORS = [
  '!~*', '!~', '->>', '#>>', '<<', '>>', '<=', '>=', '<>', '!=', '||', '::', '->', ':=', '&&', '!<', '!>',
  '=>', '!<'
]

const isSpace = (character: string) => /\s/.test(character)
const isDigit = (character: string) => character >= '0' && character <= '9'
const isWordStart = (character: string) => /[A-Za-z_\u0080-\uffff]/.test(character)
const isWord = (character: string) => /[A-Za-z0-9_$\u0080-\uffff]/.test(character)

function lineStarts(source: string) {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') starts.push(index + 1)
  return starts
}

/** Turns a character offset into a one-based line and column. */
function position(starts: number[], offset: number) {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle] <= offset) low = middle
    else high = middle - 1
  }
  return { line: low + 1, column: offset - starts[low] + 1 }
}

/**
 * Splits SQL into tokens.
 *
 * Strings, quoted identifiers and comments are read to their terminator, and a
 * missing terminator is reported rather than guessed at: a formatter that invents
 * the end of an unterminated string is worse than one that says where it gave up.
 */
export function tokenizeSql(source: string, dialect: SqlDialect = 'standard'): { tokens: SqlToken[]; errors: SqlError[] } {
  const tokens: SqlToken[] = []
  const errors: SqlError[] = []
  const starts = lineStarts(source)
  const index = { at: 0 }

  const push = (kind: SqlTokenKind, start: number, end: number) => {
    const text = source.slice(start, end)
    tokens.push({ kind, text, start, end, line: position(starts, start).line })
  }

  const fail = (code: SqlErrorCode, message: string, offset: number) => {
    const at = position(starts, offset)
    errors.push({ code, message, line: at.line, column: at.column })
  }

  while (index.at < source.length) {
    const character = source[index.at]

    if (isSpace(character)) {
      index.at += 1
      continue
    }

    if (character === '-' && source[index.at + 1] === '-') {
      const start = index.at
      while (index.at < source.length && source[index.at] !== '\n') index.at += 1
      push('comment', start, index.at)
      continue
    }

    if ((character === '#' && dialect === 'mysql') || (character === '#' && !isWord(source[index.at + 1] ?? ''))) {
      const start = index.at
      while (index.at < source.length && source[index.at] !== '\n') index.at += 1
      push('comment', start, index.at)
      continue
    }

    if (character === '/' && source[index.at + 1] === '*') {
      const start = index.at
      const close = source.indexOf('*/', start + 2)
      if (close === -1) {
        index.at = source.length
        push('comment', start, index.at)
        fail('unterminatedComment', 'Block comment is never closed.', start)
        break
      }
      index.at = close + 2
      push('comment', start, index.at)
      continue
    }

    // PostgreSQL dollar quoting: $tag$ ... $tag$.
    if (character === '$') {
      const tagged = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(source.slice(index.at))
      if (tagged) {
        const start = index.at
        const tag = tagged[0]
        const close = source.indexOf(tag, start + tag.length)
        if (close === -1) {
          index.at = source.length
          push('string', start, index.at)
          fail('unterminatedString', `Dollar-quoted string ${tag} is never closed.`, start)
          break
        }
        index.at = close + tag.length
        push('string', start, index.at)
        continue
      }
      const numbered = /^\$\d+/.exec(source.slice(index.at))
      if (numbered) {
        const start = index.at
        index.at += numbered[0].length
        push('placeholder', start, index.at)
        continue
      }
    }

    if (character === "'" || character === '"') {
      const start = index.at
      const quote = character
      index.at += 1
      let closed = false
      while (index.at < source.length) {
        if (source[index.at] === '\\' && dialect === 'mysql' && quote === "'") {
          index.at += 2
          continue
        }
        if (source[index.at] === quote) {
          if (source[index.at + 1] === quote) {
            index.at += 2
            continue
          }
          index.at += 1
          closed = true
          break
        }
        index.at += 1
      }
      // In standard SQL a double quote names something; MySQL uses it as a string.
      push(quote === '"' && dialect !== 'mysql' ? 'identifier' : 'string', start, index.at)
      if (!closed) {
        fail('unterminatedString', `${quote === '"' ? 'Quoted name' : 'String'} is never closed.`, start)
        break
      }
      continue
    }

    if (character === '`') {
      const start = index.at
      index.at += 1
      let closed = false
      while (index.at < source.length) {
        if (source[index.at] === '`') {
          if (source[index.at + 1] === '`') {
            index.at += 2
            continue
          }
          index.at += 1
          closed = true
          break
        }
        index.at += 1
      }
      push('identifier', start, index.at)
      if (!closed) {
        fail('unterminatedIdentifier', 'Backtick name is never closed.', start)
        break
      }
      continue
    }

    if (character === '?') {
      const start = index.at
      index.at += 1
      push('placeholder', start, index.at)
      continue
    }

    if ((character === ':' || character === '@') && /[A-Za-z_]/.test(source[index.at + 1] ?? '')) {
      const named = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index.at + 1))
      if (named) {
        const start = index.at
        index.at += named[0].length + 1
        push('placeholder', start, index.at)
        continue
      }
    }

    if (isDigit(character) || (character === '.' && isDigit(source[index.at + 1] ?? ''))) {
      const start = index.at
      if (character === '0' && /[xX]/.test(source[index.at + 1] ?? '')) {
        index.at += 2
        while (index.at < source.length && /[0-9a-fA-F]/.test(source[index.at])) index.at += 1
      } else {
        while (index.at < source.length && isDigit(source[index.at])) index.at += 1
        if (source[index.at] === '.') {
          index.at += 1
          while (index.at < source.length && isDigit(source[index.at])) index.at += 1
        }
        if (/[eE]/.test(source[index.at] ?? '')) {
          index.at += 1
          if (/[+-]/.test(source[index.at] ?? '')) index.at += 1
          while (index.at < source.length && isDigit(source[index.at])) index.at += 1
        }
      }
      push('number', start, index.at)
      continue
    }

    if (isWordStart(character)) {
      const start = index.at
      while (index.at < source.length && isWord(source[index.at])) index.at += 1
      const word = source.slice(start, index.at)
      const quoted = source[start - 1] === '"' || source[start - 1] === '`'
      push(quoted || !KEYWORDS.has(word.toLowerCase()) ? 'identifier' : 'keyword', start, index.at)
      continue
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index.at))
    if (operator) {
      const start = index.at
      index.at += operator.length
      push('operator', start, index.at)
      continue
    }

    const start = index.at
    index.at += 1
    push('punctuation', start, index.at)
  }

  return { tokens, errors }
}

type StatementSlice = { tokens: SqlToken[]; from: number; to: number }

/** Splits on top-level semicolons, so a `;` inside a string does not end a statement. */
export function splitStatements(tokens: SqlToken[]): StatementSlice[] {
  const slices: StatementSlice[] = []
  let current: SqlToken[] = []
  let depth = 0
  for (const token of tokens) {
    if (token.kind === 'punctuation' && token.text === '(') depth += 1
    if (token.kind === 'punctuation' && token.text === ')') depth = Math.max(0, depth - 1)
    if (token.kind === 'punctuation' && token.text === ';' && depth === 0) {
      if (current.length > 0) slices.push({ tokens: current, from: current[0].line, to: current[current.length - 1].line })
      current = []
      continue
    }
    current.push(token)
  }
  if (current.length > 0) slices.push({ tokens: current, from: current[0].line, to: current[current.length - 1].line })
  return slices
}

const STATEMENT_KINDS: [RegExp, SqlStatementKind][] = [
  [/^with\b/i, 'with'],
  [/^select\b/i, 'select'],
  [/^insert\b/i, 'insert'],
  [/^update\b/i, 'update'],
  [/^delete\b/i, 'delete'],
  [/^create\b/i, 'create'],
  [/^alter\b/i, 'alter'],
  [/^drop\b/i, 'drop'],
  [/^(explain|analyze)\b/i, 'explain'],
  [/^(truncate|pragma|vacuum|attach|detach)\b/i, 'other']
]

/** Tables and columns as they appear in the text. Names are de-duplicated. */
function readNames(tokens: SqlToken[], dialect: SqlDialect) {
  const tables = new Set<string>()
  const columns = new Set<string>()
  const name = (token: SqlToken) => stripQuotes(token.text)
  const next = (index: number) => (index + 1 < tokens.length ? tokens[index + 1] : null)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.kind !== 'keyword') continue
    const word = token.text.toLowerCase()
    const following = next(index)
    if ((word === 'from' || word === 'join' || word === 'into' || word === 'update' || word === 'table') && following) {
      if (following.kind === 'identifier' && !TYPE_WORDS.has(name(following).toLowerCase())) {
        const after = next(index + 1)
        const alias = after && after.kind === 'identifier' && !after.text.startsWith('(') && !after.text.startsWith(',')
        tables.add(alias ? `${name(following)} ${name(after)}` : name(following))
      }
      continue
    }
    if (word === 'set') {
      for (let scan = index + 1; scan < tokens.length; scan += 1) {
        if (tokens[scan].kind === 'keyword' && (tokens[scan].text.toLowerCase() === 'where' || tokens[scan].text.toLowerCase() === 'returning')) break
        const target = tokens[scan]
        if (target.kind !== 'identifier') continue
        const after = next(scan)
        if (after && after.kind === 'operator' && after.text === '=') columns.add(name(target))
      }
      continue
    }
    if (word === 'on' && following && following.kind === 'identifier') columns.add(name(following))
    if (word === 'select' || word === 'group' || word === 'order') {
      // `group`/`order` are followed by `by`, and neither starts a column list worth reading.
      if (dialect !== 'standard' && following && following.kind === 'identifier') continue
    }
  }
  return { tables: [...tables], columns: [...columns] }
}

const stripQuotes = (text: string) => {
  const first = text[0]
  if ((first === '"' || first === '`' || first === '[') && text.length > 1) {
    const last = text[text.length - 1]
    if (last === first || last === ']') return text.slice(1, -1)
  }
  return text
}

/** Reads statements for the summary panel. Names come out as written, not resolved. */
export function describeSql(source: string, dialect: SqlDialect = 'standard'): { statements: SqlStatement[]; errors: SqlError[] } {
  const { tokens, errors } = tokenizeSql(source, dialect)
  const readable = [...errors]
  // Parens are counted with the line each one opened on, so the report points at
  // the bracket that is actually missing rather than at the end of the script.
  const open: number[] = []
  for (const token of tokens) {
    if (token.kind !== 'punctuation') continue
    if (token.text === '(') open.push(token.line)
    else if (token.text === ')') {
      if (open.length === 0) {
        readable.push({
          code: 'unbalancedParenthesis',
          message: 'A closing parenthesis has no opening one.',
          line: token.line,
          column: 1
        })
      } else open.pop()
    }
  }
  for (const line of open.reverse()) {
    readable.push({ code: 'unbalancedParenthesis', message: 'A parenthesis is never closed.', line, column: 1 })
  }

  const statements: SqlStatement[] = splitStatements(tokens).map((slice) => {
    const words = slice.tokens.filter((token) => token.kind === 'keyword').map((token) => token.text.toLowerCase())
    const first = words[0] ?? ''
    const kind = STATEMENT_KINDS.find(([pattern]) => pattern.test(first))?.[1] ?? 'other'
    const phrase = PHRASES.find((candidate) => candidate.split(' ').every((word, at) => words[at] === word))
    const names = readNames(slice.tokens, dialect)
    return {
      kind,
      lead: phrase ? phrase.toUpperCase() : first.toUpperCase(),
      tables: names.tables,
      columns: names.columns,
      placeholders: slice.tokens.filter((token) => token.kind === 'placeholder').map((token) => token.text),
      from: slice.from,
      to: slice.to
    }
  })

  return { statements, errors: readable }
}

/** A list head whose items may be aligned under each other instead of the indent. */
const LIST_HEADS = new Set(['select', 'from', 'set', 'values', 'returning', 'into'])

/** The clause heads that sit one level in, under the statement they belong to. */
const NESTED_HEADS = new Set(['and', 'or'])

function render(token: SqlToken, settings: Required<SqlFormatOptions>): string {
  if (token.kind !== 'keyword') return token.text
  if (settings.keywordCase === 'upper') return token.text.toUpperCase()
  if (settings.keywordCase === 'lower') return token.text.toLowerCase()
  return token.text
}

/**
 * Whether a space goes between two tokens.
 *
 * `from` and `(` were written together in `count(*)` and read as one name, while
 * `insert into audit_log (message)` has a space, so the spacing already in the
 * source is the best evidence of what the author meant; only punctuation overrides it.
 */
function needsSpace(previous: SqlToken | null, token: SqlToken): boolean {
  if (!previous) return false
  if (token.text === ')' || token.text === ',' || token.text === ';' || token.text === '.') return false
  if (previous.text === '(' || previous.text === '.') return false
  if (previous.end === token.start) return false
  return true
}

/**
 * Formats a script.
 *
 * `sql` is the output even when there are errors: a token stream with an unclosed
 * string in it still formats into something a reader can look at, and the errors
 * are reported next to it rather than instead of it.
 */
export function formatSql(source: string, options: SqlFormatOptions = {}): SqlFormatResult {
  const settings: Required<SqlFormatOptions> = {
    dialect: options.dialect ?? 'standard',
    indent: options.indent ?? 2,
    keywordCase: options.keywordCase ?? 'upper',
    identifierCase: options.identifierCase ?? 'preserve',
    logicalOperatorsOnNewLine: options.logicalOperatorsOnNewLine ?? true,
    commaStyle: options.commaStyle ?? 'trailing',
    wrapLists: options.wrapLists ?? false,
    linesBetweenQueries: options.linesBetweenQueries ?? true,
    keepComments: options.keepComments ?? true
  }

  const described = describeSql(source, settings.dialect)
  if (source.trim() === '') {
    return {
      ok: false,
      sql: '',
      errors: [{ code: 'empty', message: 'There is no SQL to format.', line: 1, column: 1 }],
      statements: [],
      stats: emptyStats(source)
    }
  }

  const { tokens } = tokenizeSql(source, settings.dialect)
  const lines: string[] = []
  let line = ''
  let depth = 0
  let previous: SqlToken | null = null
  let previousLine = 1
  /** Column a list's first item starts at, remembered for as long as the list lasts. */
  let listAlign = -1
  /** Set only while continuing a wrapped list, so a clause break drops the indent. */
  let align = -1
  let listDepth = -1
  let forceBreak = false

  const pad = () => (align >= 0 && depth === listDepth ? ' '.repeat(align) : ' '.repeat(depth * settings.indent))

  const flush = () => {
    if (line === '') return
    lines.push(line.replace(/[ \t]+$/, ''))
    line = ''
  }

  const write = (token: SqlToken, text: string, withSpace: boolean) => {
    if (line !== '' && withSpace) line += ' '
    line += text
    previous = token
    previousLine = token.line
  }

  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at]
    const text = render(token, settings)

    if (token.kind === 'comment') {
      if (!settings.keepComments) continue
      // A comment stays where it was: on its own line when it had one, inline otherwise.
      if (!forceBreak && line !== '' && previous && previous.line === token.line) write(token, text, true)
      else {
        flush()
        line = `${' '.repeat(depth * settings.indent)}${text}`
        previous = token
        previousLine = token.line
      }
      forceBreak = true
      continue
    }

    if (token.kind === 'keyword') {
      const word = token.text.toLowerCase()
      const phrase = PHRASES.find((candidate) => {
        const parts = candidate.split(' ')
        return parts.every((part, partAt) => {
          const ahead = tokens[at + partAt]
          return ahead && ahead.kind === 'keyword' && ahead.text.toLowerCase() === part
        })
      })
      const words = phrase ? phrase.split(' ') : [word]
      const last = tokens[at + words.length - 1] ?? token
      const head = words[words.length - 1]
      const headText = words.map((part) => render({ ...token, text: part }, settings)).join(' ')

      const isLeading = depth === 0 && (LEADING.has(word) || (phrase && isClausePhrase(phrase)))
      const isLogical = settings.logicalOperatorsOnNewLine && depth === 0 && LOGICAL.has(head)

      const wrap = settings.wrapLists && depth === 0 && LIST_HEADS.has(head) && line !== ''
      if (forceBreak || isLeading || isLogical || wrap) {
        // A new clause keeps the statement's own indentation, except for the
        // boolean operators, which sit one level in under it.
        flush()
        const keepAlign = align >= 0 && !isLeading && !isLogical
        if (isLogical) line = ' '.repeat(depth * settings.indent + settings.indent)
        else if (keepAlign) line = ' '.repeat(align)
        else line = ''
      } else if (line !== '' && needsSpace(previous, token)) {
        line += ' '
      }
      align = -1

      line += headText
      if (depth === 0 && LIST_HEADS.has(head)) {
        // Whatever follows hangs off the column just after the head, so `SELECT a,`
        // and its continuation line start in the same place.
        listDepth = depth
        listAlign = line.length + 1
      }
      previous = last
      previousLine = last.line
      at += words.length - 1
      forceBreak = false
      continue
    }

    if (token.kind === 'punctuation') {
      if (token.text === '(') {
        depth += 1
        write(token, text, needsSpace(previous, token))
        continue
      }
      if (token.text === ')') {
        depth = Math.max(0, depth - 1)
        write(token, text, needsSpace(previous, token))
        continue
      }
      if (token.text === ',') {
        write(token, text, false)
        // A list only wraps when it was asked for, or when commas lead instead of
        // trailing; the column stays the one the head set.
        const wanted = depth === 0 && listDepth === depth && (settings.wrapLists || settings.commaStyle === 'leading')
        if (wanted) {
          flush()
          line = ' '.repeat(listAlign >= 0 ? listAlign : depth * settings.indent)
          align = line.length
        }
        continue
      }
      if (token.text === ';') {
        write(token, text, needsSpace(previous, token))
        flush()
        align = -1
        listAlign = -1
        listDepth = -1
        if (settings.linesBetweenQueries) lines.push('')
        forceBreak = false
        continue
      }
      if (token.text === '.') {
        write(token, text, false)
        continue
      }
      write(token, text, needsSpace(previous, token))
      continue
    }

    write(token, text, needsSpace(previous, token))
    forceBreak = false
  }
  flush()

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const sql = lines.length === 0 ? '' : `${lines.join('\n')}\n`
  return {
    ok: described.errors.length === 0,
    sql,
    errors: described.errors,
    statements: described.statements,
    stats: statsFor(source, sql, tokens, described.statements)
  }
}

function emptyStats(source: string): SqlStats {
  return {
    statements: 0,
    linesIn: source === '' ? 0 : source.split('\n').length,
    linesOut: 0,
    charactersIn: source.length,
    charactersOut: 0,
    keywords: 0,
    identifiers: 0,
    strings: 0,
    numbers: 0,
    comments: 0,
    placeholders: 0,
    tables: 0,
    columns: 0
  }
}

function statsFor(source: string, output: string, tokens: SqlToken[], statements: SqlStatement[]): SqlStats {
  const count = (kind: SqlTokenKind) => tokens.filter((token) => token.kind === kind).length
  return {
    statements: statements.length,
    linesIn: source === '' ? 0 : source.split('\n').length,
    linesOut: output === '' ? 0 : output.split('\n').length,
    charactersIn: source.length,
    charactersOut: output.length,
    keywords: count('keyword'),
    identifiers: count('identifier'),
    strings: count('string'),
    numbers: count('number'),
    comments: count('comment'),
    placeholders: count('placeholder'),
    tables: new Set(statements.flatMap((statement) => statement.tables)).size,
    columns: new Set(statements.flatMap((statement) => statement.columns)).size
  }
}

function isClausePhrase(phrase: string) {
  return /^(insert into|delete from|group by|order by|union|left join|right join|full join|inner join|cross join|create table|alter table|drop table)$/.test(
    phrase
  )
}

/** Removes comments, collapses whitespace, and uppercases keywords: a canonical form to compare against. */
export function minifySql(source: string, dialect: SqlDialect = 'standard'): string {
  const { tokens } = tokenizeSql(source, dialect)
  const kept = tokens.filter((token) => token.kind !== 'comment')
  let out = ''
  kept.forEach((token, index) => {
    const text = token.kind === 'keyword' ? token.text.toUpperCase() : token.text
    const previous = kept[index - 1]
    const glue = previous
      ? previous.text === ',' || previous.text === '(' || token.text === ')' || token.text === ','
        ? ''
        : previous.text === '.' || token.text === '.'
          ? ''
          : ' '
      : ''
    out += `${glue}${text}`
  })
  return out
}

export const sqlSample = `-- Report the orders of the last week, with the customer who placed them.
SELECT o.id AS order_id,
       o.total AS amount,
       c.name AS customer,
       o.created_at AS placed_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= now() - interval '7 days'
  AND o.status = 'paid; not pending'
ORDER BY o.total DESC
LIMIT 20;

-- A second statement, to show that each one is handled on its own.
insert into audit_log (message, at) values ('nightly import', now());
`

export const sqlSchemaSample = `CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  total NUMERIC (12, 2) DEFAULT 0,
  status TEXT CHECK (status IN ('paid', 'pending')),
  created_at TIMESTAMP
);
`