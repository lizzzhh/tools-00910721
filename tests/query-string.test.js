import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildQueryString, parseQueryString } from '../src/lib/query-string.ts'

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
  const withHash = parseQueryString('q=hello+world#section', { keepHash: true })
  assert.equal(withHash.ok, true)
  if (withHash.ok) assert.match(withHash.output, /# section/)
})

test('sorts keys and drops valueless parameters when requested', () => {
  const sorted = parseQueryString('b=2&a=1', { sortKeys: true })
  const dropped = parseQueryString('a=1&flag&b=2', { keepEmpty: false })

  assert.equal(sorted.ok && sorted.entries.map((entry) => entry.key).join(','), 'a,b')
  assert.equal(dropped.ok && dropped.count, 2)
})

test('reports malformed percent escapes with the segment position', () => {
  const result = parseQueryString('a=1&b=%E4%BE&c=3')

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.message, /第 2 个参数/)
    assert.equal(result.position, 5)
  }
})

test('builds a query string from a JSON object', () => {
  const result = buildQueryString('{"name":"码间 tools","tag":["a"],"empty":null}')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, 'name=%E7%A0%81%E9%97%B4%20tools&tag=%5B%22a%22%5D&empty=')
  assert.equal(result.count, 3)
})

test('supports pair arrays, unencoded output, plus spaces and sorting', () => {
  const pairs = buildQueryString('[{"a":"1"},{"a":"2"}]')
  const plain = buildQueryString('{"b":"2","a":"hello world"}', { encode: false, encodeSpaceAsPlus: true, sortKeys: true })

  assert.equal(pairs.ok && pairs.output, 'a=1&a=2')
  assert.equal(plain.ok && plain.output, 'a=hello+world&b=2')
})

test('rejects invalid JSON and unsupported structures', () => {
  const broken = buildQueryString('{oops}')
  const unsupported = buildQueryString('42')

  assert.equal(broken.ok, false)
  if (!broken.ok) assert.match(broken.message, /JSON/)
  assert.equal(unsupported.ok, false)
  if (!unsupported.ok) assert.match(unsupported.message, /仅支持/)
})
