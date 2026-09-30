import { strict as assert } from 'node:assert'
import test from 'node:test'
import { formatJson, getJsonStats, minifyJson, parseJson } from '../src/lib/json.ts'

test('formats JSON with indentation and sorted object keys', () => {
  const result = formatJson('{"name":"码间","features":{"json":true,"local":true},"items":[1,2]}', { indent: 2, sortKeys: true })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, '{\n  "features": {\n    "json": true,\n    "local": true\n  },\n  "items": [\n    1,\n    2\n  ],\n  "name": "码间"\n}')
  assert.equal(result.stats.type, 'object')
  assert.equal(result.stats.depth, 3)
  assert.equal(result.stats.keys, 5)
  assert.equal(result.stats.arrays, 1)
})

test('supports tab indentation and compact output', () => {
  const formatted = formatJson('{"a":1}', { indent: '\t' })
  const compact = minifyJson('{ "a": 1 }')

  assert.equal(formatted.ok, true)
  assert.equal(compact.ok, true)
  if (!formatted.ok || !compact.ok) return
  assert.equal(formatted.output, '{\n\t"a": 1\n}')
  assert.equal(compact.output, '{"a":1}')
})

test('parses primitive JSON values and calculates stats', () => {
  const parsed = parseJson('42')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value, 42)
  assert.equal(getJsonStats(parsed.value, '42').type, 'number')
  assert.equal(getJsonStats([true, null, 'text'], '[true,null,"text"]').values, 4)
})

test('reports empty input and syntax error locations', () => {
  const empty = parseJson('  ')
  assert.equal(empty.ok, false)
  if (!empty.ok) {
    assert.equal(empty.code, 'emptyInput')
    assert.equal(empty.line, 1)
    assert.equal(empty.column, 1)
  }

  const invalid = parseJson('{\n  "name": "码间",\n}')
  assert.equal(invalid.ok, false)
  if (!invalid.ok) {
    assert.equal(invalid.code, 'objectTrailingComma')
    assert.equal(invalid.line, 3)
    assert.equal(invalid.column, 1)
  }
})

test('repairs common relaxed JSON syntax', () => {
  const result = formatJson("{name: '码间', values: [1 2,], enabled: true, missing: undefined,}")

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, { name: '码间', values: [1, 2], enabled: true, missing: null })
  assert.equal(result.output, '{\n  "name": "码间",\n  "values": [\n    1,\n    2\n  ],\n  "enabled": true,\n  "missing": null\n}')
  assert.ok(result.repairs.length >= 4)
})

test('supports comments and explicit parse options', () => {
  const commented = formatJson('{/* block */ "name": "码间" // line\n}', { allowComments: true })
  const explicit = parseJson("{name: '码间'}", {
    allowUnquotedKeys: true,
    allowSingleQuotes: true,
    allowMissingColons: true
  })

  assert.equal(commented.ok, true)
  if (commented.ok) {
    assert.equal(commented.commentCount, 2)
    assert.deepEqual(commented.value, { name: '码间' })
  }
  assert.equal(explicit.ok, true)
  if (explicit.ok) assert.deepEqual(explicit.value, { name: '码间' })
})

test('keeps strict parsing strict', () => {
  const missingBrace = parseJson('{"name":"码间"')
  const extraRoot = parseJson('1,')
  const singleQuote = parseJson("{'name':'码间'}")

  assert.equal(missingBrace.ok, false)
  assert.equal(extraRoot.ok, false)
  assert.equal(singleQuote.ok, false)
})

test('supports output quote, Unicode, trailing comma, and array layout options', () => {
  const result = formatJson('{"中文":[1,2]}', {
    quote: "'",
    escapeUnicode: true,
    trailingCommas: true,
    arrayLineBreaks: false
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, "{\n  '\\u4e2d\\u6587': [1, 2,],\n}")
})

test('reports locale-neutral repair codes with params', () => {
  const result = parseJson('{"name":"码间","name":"second",}', {
    allowTrailingCommas: true,
    relaxed: true
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  const codes = result.repairs.map((repair) => repair.code)
  assert.ok(codes.includes('removedObjectTrailingComma'), `codes: ${codes.join(',')}`)
  assert.ok(codes.includes('duplicateKey'), `codes: ${codes.join(',')}`)
  const duplicate = result.repairs.find((repair) => repair.code === 'duplicateKey')
  assert.equal(duplicate.params.key, 'name')
  assert.equal(result.repairs.every((repair) => typeof repair.code === 'string'), true)
})

test('names a document nested past the depth limit instead of running out of stack', () => {
  // Parsing and serialising both walk the structure with the call stack, so a
  // document this deep used to end as a failure reported at line 1.
  const deep = (levels) => `${'['.repeat(levels)}1${']'.repeat(levels)}`

  const tooDeep = parseJson(deep(4000))
  assert.equal(tooDeep.ok, false)
  if (!tooDeep.ok) assert.equal(tooDeep.code, 'nestingTooDeep')

  // Ordinary nesting is nowhere near the limit.
  const fine = formatJson(deep(200))
  assert.equal(fine.ok, true)
  if (fine.ok) assert.equal(fine.stats.depth, 201)

  const formatted = formatJson(deep(4000))
  assert.equal(formatted.ok, false)
  if (!formatted.ok) assert.equal(formatted.code, 'nestingTooDeep')
})
