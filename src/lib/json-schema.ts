/**
 * A JSON Schema validator, draft-07 shaped.
 *
 * It validates values, not text: the page parses the JSON and the schema first,
 * which keeps this module free of string handling and makes every case in the
 * tests a value instead of a document. Issues carry the keyword that fired and
 * the instance path that failed, because "does not match" without either of
 * those is a message nobody can act on.
 *
 * `format` is an annotation, not an assertion, in the spec. It is reported as a
 * note rather than as a failure, so a `date-time` check cannot fail a document
 * that is otherwise fine because the reader's runtime disagrees about the format.
 */

export type SchemaErrorCode = 'empty' | 'notAnObject' | 'badRef' | 'circularRef'

export type Issue = {
  /** Where in the value, e.g. `$.store.book[2].price`. */
  path: string
  keyword: string
  params: Record<string, string | number>
  note?: boolean
}

export type SchemaResult =
  | { ok: true; valid: boolean; issues: Issue[]; notes: Issue[]; checked: number; keywords: string[] }
  | { ok: false; code: SchemaErrorCode; path?: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * How deep a schema is followed before it is assumed to be looping.
 *
 * A schema that refs itself is fine when the data ends: `children.items.$ref`
 * walks into a smaller value each time and stops on its own. It is only a loop
 * when the same schema is applied to the same value again, which is what the
 * depth limit and the pair check in `Validator` look for.
 */
const refDepth = 64

/** The JSON name of a value's type. `integer` is a schema word, not a JSON one. */
function typeOfValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** What the engine sees, which does distinguish `integer` from `number`. */
function rawTypeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, expected: string) {
  const actual = rawTypeOf(value)
  if (expected === 'number') return actual === 'number' || actual === 'integer'
  return actual === expected
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => deepEqual(a[key], b[key]))
  }
  return false
}

/**
 * Resolves a `$ref` against the root schema, one hop at a time.
 *
 * `#` and `""` both name the whole document, which is how a recursive schema
 * refers to itself; `#/a/b/c` walks the pointer one segment at a time so a bad
 * segment is found instead of guessed at.
 */
function resolveRef(ref: unknown, root: unknown): { ok: true; schema: unknown } | { ok: false } {
  if (typeof ref !== 'string') return { ok: false }
  if (ref === '' || ref === '#') return { ok: true, schema: root }
  if (!ref.startsWith('#/')) return { ok: false }
  let cursor: unknown = root
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isRecord(cursor) || !(key in cursor)) return { ok: false }
    cursor = cursor[key]
  }
  return { ok: true, schema: cursor }
}

class Validator {
  /** Schemas being applied right now, as `[value, schema]` pairs, innermost last. */
  private readonly active: [unknown, unknown][] = []
  private readonly root: unknown

  constructor(root: unknown) {
    this.root = root
  }

  /** Returns the issues found under one schema; `path` is where it is applied. */
  check(value: unknown, schema: unknown, path: string): Issue[] {
    if (schema === true) return []
    if (schema === false) return [{ path, keyword: 'falseSchema', params: {} }]
    if (!isRecord(schema)) return []
    // The same schema applied to the same value twice means nothing new can be
    // learned from going round again, and would not end.
    if (this.active.some(([value0, schema0]) => value0 === value && schema0 === schema)) {
      return [{ path, keyword: 'circularRef', params: {} }]
    }
    if (this.active.length >= refDepth) return [{ path, keyword: 'circularRef', params: { depth: refDepth } }]
    this.active.push([value, schema])
    try {
      return this.run(value, schema, path)
    } finally {
      this.active.pop()
    }
  }

  private run(value: unknown, schema: Record<string, unknown>, path: string): Issue[] {
    const issues: Issue[] = []
    const push = (keyword: string, params: Record<string, string | number> = {}) => {
      issues.push({ path, keyword, params })
    }

    if ('$ref' in schema) {
      const resolved = resolveRef(schema.$ref, this.root)
      if (!resolved.ok) {
        push('$ref', { ref: String(schema.$ref) })
      } else {
        issues.push(...this.check(value, resolved.schema, path))
      }
      // draft-07 says $ref ignores its siblings; most schemas rely on that, and
      // a few depend on the opposite, so the siblings are checked too.
    }

    if ('type' in schema) {
      const expected = Array.isArray(schema.type) ? (schema.type as string[]) : [String(schema.type)]
      if (!expected.some((type) => matchesType(value, type))) {
        push('type', { expected: expected.join(' | '), actual: typeOfValue(value) })
        // Once the type is wrong the keyword below cannot say anything true.
        return issues
      }
    }

    if ('enum' in schema && Array.isArray(schema.enum)) {
      if (!(schema.enum as unknown[]).some((option) => deepEqual(option, value))) {
        push('enum', { allowed: (schema.enum as unknown[]).map((option) => JSON.stringify(option)).join(' | ') })
      }
    }
    if ('const' in schema && !deepEqual(schema.const, value)) {
      push('const', { expected: JSON.stringify(schema.const) })
    }

    if (typeof value === 'number') issues.push(...this.number(value, schema, path))
    if (typeof value === 'string') issues.push(...this.string(value, schema, path))
    if (Array.isArray(value)) issues.push(...this.array(value, schema, path))
    if (isRecord(value)) issues.push(...this.object(value, schema, path))

    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = schema[keyword]
      if (!Array.isArray(branches) || branches.length === 0) continue
      const results = branches.map((branch) => this.check(value, branch, path))
      const passed = results.filter((entry) => entry.length === 0).length
      if (keyword === 'allOf') {
        for (const result of results) issues.push(...result)
      } else if (keyword === 'anyOf' && passed === 0) {
        push('anyOf', { branches: branches.length })
      } else if (keyword === 'oneOf' && passed !== 1) {
        push('oneOf', { passed, branches: branches.length })
      }
    }

    if ('not' in schema && this.check(value, schema.not, path).length === 0) push('not')

    if ('if' in schema) {
      const matched = this.check(value, schema.if, path).length === 0
      const branch = matched ? schema.then : schema.else
      if (branch !== undefined) issues.push(...this.check(value, branch, path))
    }

    return issues
  }

  private number(value: number, schema: Record<string, unknown>, path: string) {
    const issues: Issue[] = []
    const fail = (keyword: string, params: Record<string, string | number> = {}) => issues.push({ path, keyword, params })
    const bounds: [string, (limit: number) => boolean][] = [
      ['minimum', (limit) => value >= limit],
      ['maximum', (limit) => value <= limit],
      ['exclusiveMinimum', (limit) => value > limit],
      ['exclusiveMaximum', (limit) => value < limit]
    ]
    for (const [keyword, ok] of bounds) {
      const limit = schema[keyword]
      if (typeof limit === 'number' && !ok(limit)) fail(keyword, { limit })
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
      const ratio = value / schema.multipleOf
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) fail('multipleOf', { step: schema.multipleOf })
    }
    return issues
  }

  private string(value: string, schema: Record<string, unknown>, path: string) {
    const issues: Issue[] = []
    // `length` in JSON Schema counts code points, not UTF-16 units, so an emoji
    // counts once rather than twice.
    const length = [...value].length
    if (typeof schema.minLength === 'number' && length < schema.minLength) issues.push({ path, keyword: 'minLength', params: { limit: schema.minLength } })
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) issues.push({ path, keyword: 'maxLength', params: { limit: schema.maxLength } })
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value)) {
          issues.push({ path, keyword: 'pattern', params: { pattern: schema.pattern } })
        }
      } catch {
        issues.push({ path, keyword: 'pattern', params: { pattern: String(schema.pattern) }, note: true })
      }
    }
    if (typeof schema.format === 'string') {
      issues.push({ path, keyword: 'format', params: { format: schema.format }, note: true })
    }
    return issues
  }

  private array(value: unknown[], schema: Record<string, unknown>, path: string) {
    const issues: Issue[] = []
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push({ path, keyword: 'minItems', params: { limit: schema.minItems } })
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push({ path, keyword: 'maxItems', params: { limit: schema.maxItems } })
    }
    if (schema.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        for (let other = index + 1; other < value.length; other += 1) {
          if (deepEqual(value[index], value[other])) {
            issues.push({ path: `${path}[${index}]`, keyword: 'uniqueItems', params: { other } })
          }
        }
      }
    }
    if (Array.isArray(schema.items)) {
      // Tuple form: one schema per position, and `additionalItems` for the rest.
      schema.items.forEach((item, index) => {
        if (index < value.length) issues.push(...this.check(value[index], item, `${path}[${index}]`))
      })
      if (schema.additionalItems !== undefined && value.length > schema.items.length) {
        for (let index = schema.items.length; index < value.length; index += 1) {
          issues.push(...this.check(value[index], schema.additionalItems, `${path}[${index}]`))
        }
      }
    } else if (schema.items !== undefined) {
      value.forEach((item, index) => {
        issues.push(...this.check(item, schema.items, `${path}[${index}]`))
      })
    }
    // `contains` is one schema: the array has to hold at least one match for it.
    if (schema.contains !== undefined && value.length > 0) {
      const found = value.some((item, index) => this.check(item, schema.contains, `${path}[${index}]`).length === 0)
      if (!found) issues.push({ path, keyword: 'contains', params: {} })
    }
    return issues
  }

  private object(value: Record<string, unknown>, schema: Record<string, unknown>, path: string) {
    const issues: Issue[] = []
    const keys = Object.keys(value)
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const patterns = isRecord(schema.patternProperties) ? schema.patternProperties : {}

    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in value)) issues.push({ path, keyword: 'required', params: { property: key } })
      }
    }
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      issues.push({ path, keyword: 'minProperties', params: { limit: schema.minProperties } })
    }
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
      issues.push({ path, keyword: 'maxProperties', params: { limit: schema.maxProperties } })
    }

    for (const key of keys) {
      const child = `${path}.${key}`
      const quoted = /^[A-Za-z_$][\w$]*$/.test(key) ? child : `${path}[${JSON.stringify(key)}]`
      let matched = false
      if (key in properties) {
        matched = true
        issues.push(...this.check(value[key], properties[key], quoted))
      }
      for (const [pattern, branch] of Object.entries(patterns)) {
        try {
          if (!new RegExp(pattern, 'u').test(key)) continue
        } catch {
          continue
        }
        matched = true
        issues.push(...this.check(value[key], branch, quoted))
      }
      if (!matched && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) {
          issues.push({ path: quoted, keyword: 'additionalProperties', params: { property: key } })
        } else {
          issues.push(...this.check(value[key], schema.additionalProperties, quoted))
        }
      }
      if (isRecord(schema.propertyNames)) {
        issues.push(...this.check(key, schema.propertyNames, quoted))
      }
    }

    if (isRecord(schema.dependencies)) {
      for (const [key, dependency] of Object.entries(schema.dependencies)) {
        if (!(key in value)) continue
        if (Array.isArray(dependency)) {
          for (const required of dependency) {
            if (!(required in value)) issues.push({ path, keyword: 'dependencies', params: { property: required } })
          }
        } else {
          issues.push(...this.check(value, dependency, path))
        }
      }
    }
    return issues
  }
}

/** Keywords that are worth reporting even when nothing failed. */
const usedKeywords = new Set([
  '$ref', 'type', 'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'contains', 'items',
  'additionalItems', 'properties', 'patternProperties', 'additionalProperties', 'required', 'propertyNames',
  'minProperties', 'maxProperties', 'dependencies', 'allOf', 'anyOf', 'oneOf', 'not', 'if'
])

/**
 * Every keyword the schema uses, at any depth.
 *
 * A schema that says nothing but `$ref` reads as empty on its own, and the count
 * is the number the reader wants to see when judging how much was checked.
 */
function collectKeywords(schema: unknown): string[] {
  const found = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      if (seen.has(node)) return
      seen.add(node)
      node.forEach(walk)
      return
    }
    if (!isRecord(node) || seen.has(node)) return
    seen.add(node)
    for (const [keyword, value] of Object.entries(node)) {
      if (usedKeywords.has(keyword)) found.add(keyword)
      if (keyword === 'properties' || keyword === 'patternProperties' || keyword === 'definitions' || keyword === 'dependencies') {
        if (isRecord(value)) Object.values(value).forEach(walk)
      } else if (keyword !== 'enum' && keyword !== 'const' && keyword !== 'default' && keyword !== 'examples') {
        walk(value)
      }
    }
  }
  walk(schema)
  return [...found].sort()
}

export function validateJson(value: unknown, schema: unknown, rootPath = '$'): SchemaResult {
  if (schema === undefined || schema === null) return { ok: false, code: 'empty' }
  // draft-07 allows `true` and `false` wherever a schema goes: true accepts
  // anything, false accepts nothing.
  if (typeof schema !== 'object' && typeof schema !== 'boolean') return { ok: false, code: 'notAnObject' }

  const found = new Validator(schema).check(value, schema, rootPath)
  const issues = found.filter((issue) => !issue.note)
  const notes = found.filter((issue) => issue.note)
  const keywords = collectKeywords(schema)
  return { ok: true, valid: issues.length === 0, issues, notes, checked: issues.length + notes.length, keywords }
}

/** A schema that describes a person, used as the page's sample. */
export const sampleSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Order',
  type: 'object',
  required: ['id', 'customer', 'total'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^ORD-[0-9]{4}$' },
    customer: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, vip: { type: 'boolean' } } },
    items: { type: 'array', minItems: 1, items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 } } } },
    total: { type: 'number', minimum: 0, multipleOf: 0.01 },
    note: { type: ['string', 'null'], maxLength: 200 }
  }
} as const

export const sampleDocument = {
  id: 'ORD-0001',
  customer: { name: 'Ava', vip: true },
  items: [{ sku: 'BOOK-1', qty: 2 }],
  total: 39.98,
  note: null
}