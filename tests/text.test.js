import { strict as assert } from 'node:assert'
import test from 'node:test'
import { convertCase, convertWidth, splitWords } from '../src/lib/text.ts'

test('splits words on separators and camel case boundaries', () => {
  assert.deepEqual(splitWords('hello world'), ['hello', 'world'])
  assert.deepEqual(splitWords('helloWorldAgain'), ['hello', 'World', 'Again'])
  assert.deepEqual(splitWords('parseHTTPResponse-v2'), ['parse', 'HTTP', 'Response', 'v2'])
  assert.deepEqual(splitWords('  多词   文本 '), ['多词', '文本'])
  assert.deepEqual(splitWords('---'), [])
})

test('converts between common naming conventions', () => {
  assert.equal(convertCase('hello world', 'camel').output, 'helloWorld')
  assert.equal(convertCase('hello world', 'pascal').output, 'HelloWorld')
  assert.equal(convertCase('helloWorld', 'snake').output, 'hello_world')
  assert.equal(convertCase('helloWorld', 'kebab').output, 'hello-world')
  assert.equal(convertCase('hello world', 'constant').output, 'HELLO_WORLD')
  assert.equal(convertCase('hello world', 'dot').output, 'hello.world')
  assert.equal(convertCase('hello world', 'path').output, 'hello/world')
  assert.equal(convertCase('hello world', 'train').output, 'Hello-World')
  assert.equal(convertCase('helloWorld', 'title').output, 'Hello World')
  assert.equal(convertCase('hello world', 'sentence').output, 'Hello world')
})

test('applies case styles that work on the whole string', () => {
  assert.equal(convertCase('Hello World', 'upper').output, 'HELLO WORLD')
  assert.equal(convertCase('Hello World', 'lower').output, 'hello world')
  assert.equal(convertCase('hello world', 'alternating').output, 'HeLlO WoRlD')
  assert.equal(convertCase('hello world', 'reverse').output, 'dlrow olleh')
  assert.equal(convertCase('hello world', 'first-upper').output, 'Hello world')
})

test('keeps CJK text unchanged and counts words', () => {
  const result = convertCase('码间 tools', 'snake')

  assert.equal(result.output, '码间_tools')
  assert.equal(result.words, 2)
  assert.equal(convertCase('---', 'camel').output, '')
  assert.equal(convertCase('', 'upper').words, 0)
})

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
