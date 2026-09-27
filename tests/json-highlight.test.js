import { strict as assert } from 'node:assert'
import test from 'node:test'
import { tokenizeJson } from '../src/lib/json-highlight.ts'

/** The pieces of a kind, joined back together, so a kind can be looked for. */
const textOf = (tokens, kind) =>
  tokens
    .filter((token) => token.kind === kind)
    .map((token) => token.text)
    .join('')

test('says a word is not JSON rather than colouring it', () => {
  assert.equal(tokenizeJson('dark'), null)
  assert.equal(tokenizeJson('checks'), null)
  assert.equal(tokenizeJson('not json at all'), null)
  assert.equal(tokenizeJson(''), null)
})

test('a bare JSON value is coloured as that value', () => {
  assert.deepEqual(tokenizeJson('42'), [{ kind: 'number', text: '42' }])
  assert.deepEqual(tokenizeJson('true'), [{ kind: 'boolean', text: 'true' }])
  assert.deepEqual(tokenizeJson('null'), [{ kind: 'null', text: 'null' }])
  assert.deepEqual(tokenizeJson('"dark"'), [{ kind: 'string', text: '"dark"' }])
})

test('a name is told apart from a value', () => {
  const tokens = tokenizeJson('{"a":"b"}')
  assert.equal(textOf(tokens, 'key'), '"a"')
  assert.equal(textOf(tokens, 'string'), '"b"')
})

test('a name followed by a space is still a name', () => {
  const tokens = tokenizeJson('{ "a" : 1 }')
  assert.equal(textOf(tokens, 'key'), '"a"')
  assert.equal(textOf(tokens, 'number'), '1')
})

test('every piece of a document is accounted for', () => {
  const source = '{"notes":[{"id":"n1","monospace":true,"at":null,"size":12.5}],"ok":false}'
  assert.equal(tokenizeJson(source).map((token) => token.text).join(''), source)
})

test('an escape inside a string does not end it early', () => {
  const tokens = tokenizeJson('{"a":"say \\"hi\\"","b":"back\\\\slash"}')
  // Parsing each piece back is the honest check: the cut landed in the right place.
  assert.deepEqual(
    tokens.filter((token) => token.kind === 'string').map((token) => JSON.parse(token.text)),
    ['say "hi"', 'back\\slash']
  )
  assert.deepEqual(
    tokens.filter((token) => token.kind === 'key').map((token) => JSON.parse(token.text)),
    ['a', 'b']
  )
})

test('whitespace and punctuation come back untouched', () => {
  const source = '{\n  "a": [\n    1\n  ]\n}'
  const tokens = tokenizeJson(source)
  assert.equal(tokens.map((token) => token.text).join(''), source)
  assert.ok(textOf(tokens, 'plain').includes('\n'))
  assert.ok(textOf(tokens, 'punctuation').includes('{'))
})

test('an escaped key still counts as a name', () => {
  const tokens = tokenizeJson('{"a\\"b":1}')
  assert.equal(textOf(tokens, 'key'), '"a\\"b"')
})

test('a negative and an exponent number are one piece', () => {
  const tokens = tokenizeJson('[-1, 2e10, 1.5e-3]')
  assert.equal(textOf(tokens, 'number'), '-12e101.5e-3')
})
