import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildQueryString, countDuplicateKeys, parseQueryString, selectEntries } from '../src/lib/query-string.ts'

test('parses a query string into decoded entries', () => {
  const result = parseQueryString('?name=%E7%A0%81%E9%97%B4&tag=a&tag=b&flag')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.count, 4)
  assert.equal(result.duplicateKeys, 1)
  assert.deepEqual(result.entries[0], { key: 'name', value: '码间', hasValue: true })
  assert.deepEqual(result.entries[3], { key: 'flag', value: '', hasValue: false })
})

test('converts plus signs to spaces and keeps fragments separate', () => {
  const result = parseQueryString('q=hello+world#section')

  assert.equal(result.ok && result.entries[0].value, 'hello world')
  assert.equal(result.ok && result.hash, 'section')
  assert.equal(result.ok && buildQueryString(result.entries, { encodeSpaceAsPlus: true }), 'q=hello+world')
  assert.equal(
    result.ok && buildQueryString(result.entries, { appendHash: true, hash: result.hash }),
    'q=hello%20world#section'
  )
})

test('sorts keys and drops valueless parameters when requested', () => {
  const sorted = parseQueryString('b=2&a=1')
  const dropped = parseQueryString('a=1&flag&b=2')

  assert.equal(sorted.ok && selectEntries(sorted.entries, { sortKeys: true }).map((entry) => entry.key).join(','), 'a,b')
  assert.equal(dropped.ok && selectEntries(dropped.entries, { includeEmpty: false }).length, 2)
})

test('extracts the query from a full URL instead of parsing the path as a key', () => {
  const result = parseQueryString(
    'https://example.com/list?utm_source=weibo&utm_medium=%E7%A4%BE%E4%BA%A4&tags=%E4%B8%AD%E6%96%87&draft&q=hello+world#section'
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.base, 'https://example.com/list')
  assert.equal(result.hash, 'section')
  assert.equal(result.count, 5)
  assert.deepEqual(result.entries.map((entry) => entry.key), ['utm_source', 'utm_medium', 'tags', 'draft', 'q'])
  assert.equal(result.entries[1].value, '社交')
  assert.equal(result.entries[2].value, '中文')
  assert.equal(result.entries[3].hasValue, false)
  assert.equal(result.entries[4].value, 'hello world')
})

test('treats a URL without a query string as having no parameters', () => {
  const plain = parseQueryString('https://example.com/list')
  const fragment = parseQueryString('https://example.com/list#top')
  const host = parseQueryString('example.com')
  const schemeRelative = parseQueryString('//example.com/list?a=1')

  assert.equal(plain.ok && plain.count, 0)
  assert.equal(fragment.ok && fragment.hash, 'top')
  assert.equal(fragment.ok && fragment.count, 0)
  assert.equal(host.ok && host.count, 0)
  assert.equal(schemeRelative.ok && schemeRelative.entries[0].key, 'a')
  assert.equal(schemeRelative.ok && schemeRelative.base, '//example.com/list')
})

test('keeps a bare query string working and reports positions against the pasted text', () => {
  const bare = parseQueryString('a=1&b=2')
  const flags = parseQueryString('flag&other')
  const single = parseQueryString('flag')
  const broken = parseQueryString('https://example.com/list?a=1&b=%E4%BE')

  assert.equal(bare.ok && bare.count, 2)
  assert.equal(flags.ok && flags.entries.map((entry) => entry.key).join(','), 'flag,other')
  assert.equal(single.ok && single.entries[0].hasValue, false)
  assert.equal(broken.ok, false)
  if (!broken.ok) assert.equal(broken.position, 'https://example.com/list?a=1&'.length + 1)
})

test('reports malformed percent escapes with the segment position', () => {
  const result = parseQueryString('a=1&b=%E4%BE&c=3')

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, 'badValueEncoding')
    assert.equal(result.params.index, 2)
    assert.equal(result.position, 5)
  }
})

test('builds a query string from parsed entries', () => {
  const parsed = parseQueryString('name=%E7%A0%81%E9%97%B4%20tools')
  const entries = parsed.ok
    ? [...parsed.entries, { key: 'draft', value: '', hasValue: false }]
    : []

  assert.equal(buildQueryString(entries), 'name=%E7%A0%81%E9%97%B4%20tools&draft')
  assert.equal(buildQueryString(entries, { leadingQuestionMark: true }), '?name=%E7%A0%81%E9%97%B4%20tools&draft')
  assert.equal(buildQueryString(entries, { encode: false }), 'name=码间 tools&draft')
})

test('supports empty values, blank keys and duplicate pairs', () => {
  const entries = [
    { key: 'a', value: '1', hasValue: true },
    { key: 'a', value: '2', hasValue: true },
    { key: 'empty', value: '', hasValue: true },
    { key: 'flag', value: '', hasValue: false },
    { key: '', value: 'orphan', hasValue: true }
  ]

  assert.equal(buildQueryString(entries), 'a=1&a=2&empty=&flag')
  assert.equal(buildQueryString(entries, { includeEmpty: false }), 'a=1&a=2&empty=')
  assert.equal(buildQueryString(entries, { sortKeys: true }), 'a=1&a=2&empty=&flag')
  assert.equal(buildQueryString([]), '')
  assert.equal(countDuplicateKeys(entries), 1)
})

test('round-trips a query string through parse and build', () => {
  const original = '?utm_source=weibo&tags=a&tags=b&draft'
  const parsed = parseQueryString(original)

  assert.equal(parsed.ok && buildQueryString(parsed.entries), 'utm_source=weibo&tags=a&tags=b&draft')
})
