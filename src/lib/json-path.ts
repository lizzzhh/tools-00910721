/**
 * JSONPath querying.
 *
 * The dialect is the common subset every implementation agrees on: `$` for the
 * root, dot and bracket child access, `[*]` and `.*` for wildcards, `..` for
 * recursive descent, `[start:end]` slices, scriptless `[?(@.x == 1)]` filters and
 * the three terminal functions. Script expressions are deliberately not
 * supported: evaluating a language inside a query is how these tools end up
 * running code, and nothing here needs one.
 *
 * Every node carries the path that reaches it, because "found 4 results" is
 * much less useful than being told which four.
 */

export type PathErrorCode = 'empty' | 'syntax' | 'unknownFunction' | 'badFilter'

export type PathNode = {
  value: unknown
  /** The concrete location, with array indices filled in: `$.store.book[0]`. */
  path: string
}

export type JsonPathResult =
  | { ok: true; nodes: PathNode[]; count: number; wildcard: boolean }
  | { ok: false; code: PathErrorCode; position?: number }

type Segment =
  | { kind: 'child'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'union'; indexes: number[] }
  | { kind: 'slice'; from?: number; to?: number }
  | { kind: 'wildcard' }
  | { kind: 'descend'; name: string | null }
  | { kind: 'filter'; test: Filter }
  | { kind: 'call'; name: 'length' | 'keys' | 'values' }

type Filter = {
  path: string
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<='
  value?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Arrays have no keys worth looking for, but their items are still descended into. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Children paired with the path suffix that reaches them. */
function childrenOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, at): [string, unknown] => [`[${at}]`, item])
  if (isRecord(value)) return Object.entries(value)
  return []
}

/** Splits a path into steps, so the walker can stay a plain loop. */
export function parsePath(expression: string): { ok: true; segments: Segment[] } | { ok: false; code: PathErrorCode; position: number } {
  const text = expression.trim()
  if (!text) return { ok: false, code: 'empty', position: 0 }
  let index = 0
  if (text[index] === '$') index += 1
  else if (text[index] !== '.' && text[index] !== '[') return { ok: false, code: 'syntax', position: 0 }

  const segments: Segment[] = []
  while (index < text.length) {
    const at = index
    const character = text[index]
    if (character === '.') {
      const deep = text[index + 1] === '.'
      index += deep ? 2 : 1
      if (!deep && text[index] === '*') {
        segments.push({ kind: 'wildcard' })
        index += 1
        continue
      }
      const name = readName(text, index)
      if (!name) {
        // `..` on its own is a valid step; `.` followed by nothing is not.
        if (deep) {
          segments.push({ kind: 'descend', name: null })
          continue
        }
        return { ok: false, code: 'syntax', position: at }
      }
      // `$.a.length()` and `$.a[length()]` are the same query written two ways.
      const called = /^([a-zA-Z]+)\s*\(\s*\)/.exec(text.slice(name.at - name.value.length))
      if (called) {
        const functionName = called[1].toLowerCase()
        if (functionName !== 'length' && functionName !== 'keys' && functionName !== 'values') {
          return { ok: false, code: 'unknownFunction', position: at }
        }
        segments.push({ kind: 'call', name: functionName as 'length' | 'keys' | 'values' })
        index = text.indexOf(')', name.at) + 1
        continue
      }
      segments.push(deep ? { kind: 'descend', name: name.value } : { kind: 'child', name: name.value })
      index = name.at
      continue
    }

    if (character === '[') {
      const close = findClosing(text, index)
      if (close < 0) return { ok: false, code: 'syntax', position: at }
      const body = text.slice(index + 1, close).trim()
      const parsed = parseBracket(body, at)
      if ('code' in parsed) return parsed
      segments.push(parsed.segment)
      index = close + 1
      continue
    }

    return { ok: false, code: 'syntax', position: at }
  }
  return { ok: true, segments }
}

function readName(text: string, from: number) {
  let index = from
  // `(` stops the name so the call that may follow it is left for the caller to
  // read; a key that needs one can be written in brackets.
  while (index < text.length && !'.[(]'.includes(text[index])) index += 1
  const raw = text.slice(from, index)
  if (!raw) return null
  return { value: raw, at: index }
}

function findClosing(text: string, open: number) {
  let depth = 0
  let quote: string | null = null
  for (let index = open; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '[' || character === '(') depth += 1
    else if (character === ']' || character === ')') {
      depth -= 1
      if (depth === 0 && character === ']') return index
    }
  }
  return -1
}

function parseBracket(body: string, at: number): { segment: Segment } | { ok: false; code: PathErrorCode; position: number } {
  if (body === '*') return { segment: { kind: 'wildcard' } }
  if (body.startsWith('?')) return { segment: { kind: 'filter', test: parseFilter(body) } }

  const quoted = /^(['"])(.*)\1$/.exec(body)
  if (quoted) return { segment: { kind: 'child', name: quoted[2] } }

  const call = /^([a-zA-Z]+)\s*\(\s*\)$/.exec(body)
  if (call) {
    const name = call[1].toLowerCase()
    if (name !== 'length' && name !== 'keys' && name !== 'values') return { ok: false, code: 'unknownFunction', position: at }
    return { segment: { kind: 'call', name: name as 'length' | 'keys' | 'values' } }
  }

  if (/^-?\d+$/.test(body)) return { segment: { kind: 'index', index: Number(body) } }
  // `[0,2]` selects both, and unlike a slice it keeps its own order.
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim())
    if (parts.every((part) => /^-?\d+$/.test(part))) {
      return { segment: { kind: 'union', indexes: parts.map(Number) } }
    }
  }
  if (/^-?\d*\s*:\s*-?\d*$/.test(body) && body.includes(':')) {
    const [from, to] = body.split(':')
    return {
      segment: {
        kind: 'slice',
        ...(from.trim() === '' ? {} : { from: Number(from) }),
        ...(to.trim() === '' ? {} : { to: Number(to) })
      }
    }
  }
  // A bare word in brackets is a key, which is how most implementations read it.
  if (body && !/[\s=!<>]/.test(body)) return { segment: { kind: 'child', name: body } }
  return { ok: false, code: 'syntax', position: at }
}

function parseFilter(body: string): Filter {
  const inner = body.replace(/^\?\s*\(/, '').replace(/\)\s*$/, '').trim()
  const match = /^@([A-Za-z0-9_$.[\]'-]*)(\s*(==|!=|>=|<=|>|<)\s*(.+))?$/.exec(inner)
  if (!match) return { path: inner.startsWith('@') ? inner.slice(1) : inner }
  const path = match[1]
  if (!match[2]) return { path }
  return { path, operator: match[3] as Filter['operator'], value: parseLiteral(match[4]) }
}

function parseLiteral(text: string): unknown {
  const trimmed = text.trim().replace(/^['"]|['"]$/g, '')
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && trimmed !== '' ? numeric : trimmed
}

/** Resolves a filter's left-hand side, which is itself a path from the node. */
function resolveFilterPath(value: unknown, path: string): { found: boolean; value: unknown } {
  if (path === '' || path === '.') return { found: true, value }
  let cursor: unknown = value
  for (const piece of path.split('.').filter(Boolean)) {
    const index = /^\d+$/.test(piece) ? Number(piece) : null
    if (Array.isArray(cursor)) {
      if (index === null || index >= cursor.length) return { found: false, value: undefined }
      cursor = cursor[index]
      continue
    }
    if (!isRecord(cursor) || !(piece in cursor)) return { found: false, value: undefined }
    cursor = cursor[piece]
  }
  return { found: true, value: cursor }
}

function passes(node: PathNode, test: Filter) {
  const resolved = resolveFilterPath(node.value, test.path)
  // No operator means an existence test, which is about the key being there: a
  // value of `false` or `null` still exists.
  if (!test.operator) return resolved.found
  if (!resolved.found) return test.operator === '!='
  const left = resolved.value
  const right = test.value
  switch (test.operator) {
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '>':
      return Number(left) > Number(right)
    case '<':
      return Number(left) < Number(right)
    case '>=':
      return Number(left) >= Number(right)
    default:
      return Number(left) <= Number(right)
  }
}

/** Walks every branch, because `..` fans out and the result order has to be stable. */
function collect(value: unknown, path: string, segments: Segment[], into: PathNode[]): void {
  if (segments.length === 0) {
    into.push({ value, path })
    return
  }
  const [head, ...rest] = segments
  switch (head.kind) {
    case 'child': {
      if (isRecord(value) && head.name in value) collect(value[head.name], `${path}.${head.name}`, rest, into)
      return
    }
    case 'index': {
      if (Array.isArray(value)) {
        const at = head.index < 0 ? value.length + head.index : head.index
        if (at >= 0 && at < value.length) collect(value[at], `${path}[${at}]`, rest, into)
      }
      return
    }
    case 'union': {
      if (!Array.isArray(value)) return
      // Duplicates in the selector would otherwise repeat a node, and one index
      // twice is a typo rather than an intent.
      for (const wanted of [...new Set(head.indexes)]) {
        const at = wanted < 0 ? value.length + wanted : wanted
        if (at >= 0 && at < value.length) collect(value[at], `${path}[${at}]`, rest, into)
      }
      return
    }
    case 'slice': {
      if (!Array.isArray(value)) return
      const from = head.from === undefined ? 0 : head.from < 0 ? value.length + head.from : head.from
      const to = head.to === undefined ? value.length : head.to < 0 ? value.length + head.to : head.to
      for (let at = Math.max(0, from); at < Math.min(value.length, to); at += 1) {
        collect(value[at], `${path}[${at}]`, rest, into)
      }
      return
    }
    case 'wildcard': {
      if (Array.isArray(value)) {
        value.forEach((item, at) => collect(item, `${path}[${at}]`, rest, into))
        return
      }
      for (const [suffix, item] of childrenOf(value)) collect(item, `${path}${suffix}`, rest, into)
      return
    }
    case 'descend': {
      if (head.name !== null) {
        descendInto(value, path, head.name, rest, into)
        return
      }
      // A bare `..` has no name to look for, so every node below this one stays in
      // scope and what follows is applied to each of them.
      descendAll(value, path, rest, into)
      return
    }
    case 'filter': {
      for (const [suffix, item] of childrenOf(value)) {
        const node = { value: item, path: `${path}${suffix}` }
        if (passes(node, head.test)) collect(node.value, node.path, rest, into)
      }
      return
    }
    case 'call': {
      // A terminal function collapses the selection to one value.
      if (head.name === 'length') {
        const size = Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : 0
        into.push({ value: size, path: `${path}.length()` })
        return
      }
      if (head.name === 'keys') {
        const keys = Array.isArray(value) ? value.map((_, at) => at) : isRecord(value) ? Object.keys(value) : []
        into.push({ value: keys, path: `${path}.keys()` })
        return
      }
      if (head.name === 'values') {
        const values = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []
        into.push({ value: values, path: `${path}.values()` })
        return
      }
    }
  }
}

/**
 * Every node at or below `value`, in document order. The node itself is included
 * because `$..[...]` is read as "every descendant", and `..` on its own does not
 * move the position it starts from.
 */
function descendAll(value: unknown, path: string, tail: Segment[], into: PathNode[]) {
  // Through `collect`, so a filter or a name after a bare `..` is applied to
  // every candidate rather than only to the first.
  collect(value, path, tail, into)
  for (const [suffix, item] of childrenOf(value)) descendAll(item, `${path}${suffix}`, tail, into)
}

/**
 * Depth-first search for every `name` under `value`.
 *
 * The node itself is in scope, so `$.store..price` also finds `store.price` and
 * not only what is below it. Arrays are searched for the name too: `..book` has
 * to reach a key whose value is a list, which is where a document keeps one.
 */
function descendInto(value: unknown, path: string, name: string, rest: Segment[], into: PathNode[]) {
  if (isObject(value) && name in value) collect(value[name], `${path}.${name}`, rest, into)
  for (const [suffix, item] of childrenOf(value)) descendInto(item, `${path}${suffix}`, name, rest, into)
}

export function queryJsonPath(value: unknown, expression: string): JsonPathResult {
  const parsed = parsePath(expression)
  if (!parsed.ok) return { ok: false, code: parsed.code, position: parsed.position }
  const nodes: PathNode[] = []
  collect(value, '$', parsed.segments, nodes)
  return {
    ok: true,
    nodes,
    count: nodes.length,
    wildcard: parsed.segments.some((segment) => segment.kind !== 'child' && segment.kind !== 'index')
  }
}

/** Named examples, so the page can offer a starting point for a JSON shape. */
export const jsonPathExamples = [
  { id: 'root', expression: '$' },
  { id: 'keys', expression: '$.*.name' },
  { id: 'first', expression: '$.store.book[0]' },
  { id: 'recursive', expression: '$..price' },
  { id: 'deepName', expression: '$..book[-1].title' },
  { id: 'filter', expression: '$.store.book[?(@.price < 10)]' },
  { id: 'exists', expression: '$.store.book[?(@.isbn)]' },
  { id: 'length', expression: '$.store.book.length()' },
  { id: 'names', expression: '$.store.book[*].author' }
] as const