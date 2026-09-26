import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decodeUnicode, encodeUnicode, escapeCodePoint, inspectCodePoints } from '../src/lib/unicode.ts'

test('escapes non-ASCII characters with the selected style', () => {
  const short = encodeUnicode('a中😀', 'short')
  const long = encodeUnicode('a中😀', 'long')
  const hex = encodeUnicode('中A', 'hex')
  const decimal = encodeUnicode('中A', 'decimal')

  assert.equal(short.ok && short.output, 'a\\u4E2D\\uD83D\\uDE00')
  assert.equal(long.ok && long.output, 'a\\u4E2D\\u{1F600}')
  assert.equal(hex.ok && hex.output, '4E2D 0041')
  assert.equal(decimal.ok && decimal.output, '20013 65')
})

test('escapes control characters only when the scope allows it', () => {
  const nonAscii = encodeUnicode('a\tb', 'short', 'non-ascii')
  const control = encodeUnicode('a\tb', 'short', 'control')

  assert.equal(nonAscii.ok && nonAscii.output, 'a\tb')
  assert.equal(control.ok && control.output, 'a\\u0009b')
  assert.equal(control.ok && control.replaced, 1)
})

test('decodes JavaScript, hex, octal, percent and numeric escapes', () => {
  const escapes = decodeUnicode('\\u4E2D\\u{6587}\\x21\\101%u4F60\\uD83D\\uDE00')
  const numeric = decodeUnicode('&#20013;&#x6587;')
  const control = decodeUnicode('a\\nb')

  assert.equal(escapes.ok && escapes.output, '中文!A你😀')
  assert.equal(numeric.ok && numeric.output, '中文')
  assert.equal(control.ok && control.output, 'a\nb')
  assert.equal(escapes.ok && escapes.replaced, 7)
})

test('keeps unknown escape sequences readable', () => {
  const result = decodeUnicode('path\\to\\file')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, 'path\to\file')
})

test('reports invalid code points in escape sequences', () => {
  const surrogate = decodeUnicode('\\uD800')
  const tooLarge = decodeUnicode('\\u{110000}')
  const badHex = decodeUnicode('\\uZZZZ')

  assert.equal(surrogate.ok, false)
  if (!surrogate.ok) {
    assert.equal(surrogate.code, 'loneSurrogate')
    assert.equal(surrogate.position, 1)
  }
  assert.equal(tooLarge.ok, false)
  assert.equal(badHex.ok, false)
  if (!badHex.ok) assert.equal(badHex.code, 'invalidCodePoint')
})

test('inspects code points with UTF-8 bytes', () => {
  const report = inspectCodePoints('中a')
  const emoji = inspectCodePoints('😀')

  assert.equal(report.total, 2)
  assert.equal(report.distinct, 2)
  assert.equal(report.rows[0].hex, 'U+4E2D')
  assert.equal(report.rows[0].utf8, 'E4 B8 AD')
  assert.equal(report.rows[0].escape, '\\u4E2D')
  assert.equal(report.rows[1].hex, 'U+0061')
  assert.equal(emoji.rows[0].utf8, 'F0 9F 98 80')
  assert.equal(emoji.rows[0].escape, '\\u{1F600}')
  assert.equal(escapeCodePoint(0x1f600, 'long'), '\\u{1F600}')
})

test('limits the inspected rows without changing the totals', () => {
  const report = inspectCodePoints('abcdef', 2)

  assert.equal(report.rows.length, 2)
  assert.equal(report.total, 6)
  assert.equal(report.distinct, 6)
})
