import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decodeHtml, encodeHtml } from '../src/lib/html-entities.ts'

test('escapes basic HTML syntax', () => {
  const result = encodeHtml('<a href="x">Tom & Jerry</a>')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;')
  assert.equal(result.replaced, 7)
})

test('encodes symbols and non-ASCII characters with the selected format', () => {
  const named = encodeHtml('café ¥', 'named')
  const all = encodeHtml('中A', 'all')
  const hex = encodeHtml('中A', 'all', 'hex')

  assert.equal(named.ok && named.output, 'caf&eacute; &yen;')
  assert.equal(all.ok && all.output, '&#20013;A')
  assert.equal(hex.ok && hex.output, '&#x4E2D;A')
})

test('keeps non-ASCII characters untouched in basic mode', () => {
  const result = encodeHtml('码间 <b>', 'basic')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, '码间 &lt;b&gt;')
  assert.equal(result.replaced, 2)
})

test('decodes named, decimal and hex entities', () => {
  const named = decodeHtml('caf&eacute; &amp; bar')
  const numeric = decodeHtml('&#20013;&#x6587;')

  assert.equal(named.ok && named.output, 'café & bar')
  assert.equal(numeric.ok && numeric.output, '中文')
})

test('reports unknown entities with their position and supports lenient mode', () => {
  const strict = decodeHtml('a &bogus; b')
  const lenient = decodeHtml('a &bogus; b', true)
  const surrogate = decodeHtml('&#xD800;')
  const tooLarge = decodeHtml('&#x110000;')

  assert.equal(strict.ok, false)
  if (!strict.ok) {
    assert.equal(strict.code, 'unknownEntity')
    assert.equal(strict.params.raw, '&bogus;')
    assert.equal(strict.position, 3)
  }
  assert.equal(lenient.ok && lenient.output, 'a &bogus; b')
  assert.equal(surrogate.ok, false)
  assert.equal(tooLarge.ok, false)
})

test('reports numeric code points that are out of range', () => {
  const tooLarge = decodeHtml('&#99999999999;')
  const noDigits = decodeHtml('&#;')

  assert.equal(tooLarge.ok, false)
  if (!tooLarge.ok) assert.equal(tooLarge.code, 'invalidCodePoint')
  assert.equal(noDigits.ok, true)
  if (noDigits.ok) assert.equal(noDigits.output, '&#;')
})
