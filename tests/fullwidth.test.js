import { strict as assert } from 'node:assert'
import test from 'node:test'
import { convertWidth } from '../src/lib/fullwidth.ts'

test('converts full-width characters to half-width', () => {
  const result = convertWidth('ＡＢＣ１２３（）＋', 'to-half')
  const katakana = convertWidth('カタカナ', 'to-half')
  const punctuation = convertWidth('你好，世界。', 'to-half')

  assert.equal(result.output, 'ABC123()+')
  assert.equal(result.converted, 9)
  assert.equal(katakana.output, 'ｶﾀｶﾅ')
  assert.equal(punctuation.output, '你好,世界.')
  assert.equal(punctuation.converted, 2)
})

test('converts half-width characters to full-width', () => {
  const letters = convertWidth('ABC-123', 'to-full')
  const keptSpace = convertWidth('a b', 'to-full', { keepSpace: true })
  const fullSpace = convertWidth('a b', 'to-full', { keepSpace: false })

  assert.equal(letters.output, 'ＡＢＣ－１２３')
  assert.equal(keptSpace.output, 'ａ ｂ')
  assert.equal(fullSpace.output, 'ａ　ｂ')
  assert.equal(convertWidth('ｶﾀｶﾅ', 'to-full').output, 'カタカナ')
  assert.equal(convertWidth('abc', 'to-full').output, 'ａｂｃ')
})

test('round-trips full-width and half-width punctuation', () => {
  const original = '你好，世界。（测试）'
  const half = convertWidth(original, 'to-half').output
  const full = convertWidth(half, 'to-full').output

  assert.equal(half, '你好,世界.(测试)')
  assert.equal(full, '你好，世界．（测试）')
})
