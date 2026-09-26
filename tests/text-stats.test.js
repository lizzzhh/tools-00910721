import { strict as assert } from 'node:assert'
import test from 'node:test'
import { analyzeText } from '../src/lib/text-stats.ts'

test('counts characters, lines and paragraphs for plain text', () => {
  const stats = analyzeText('Hello world.\nSecond line here.')

  assert.equal(stats.characters, 30)
  assert.equal(stats.lines, 2)
  assert.equal(stats.nonEmptyLines, 2)
  assert.equal(stats.paragraphs, 1)
  assert.equal(stats.sentences, 2)
  assert.equal(stats.words, 5)
  assert.equal(stats.bytes, 30)
})

test('separates CJK characters from latin words', () => {
  const stats = analyzeText('码间 tools 工具')

  assert.equal(stats.cjk, 4)
  assert.equal(stats.words, 3)
  assert.equal(stats.cjkWords, 2)
  assert.equal(stats.letters, 5)
  assert.equal(stats.digits, 0)
})

test('counts digits, punctuation and whitespace separately', () => {
  const stats = analyzeText('a1, b2.\n\nc3!')

  assert.equal(stats.digits, 3)
  assert.equal(stats.punctuation, 3)
  assert.equal(stats.charactersNoSpaces, 9)
  assert.equal(stats.paragraphs, 2)
  assert.equal(stats.uniqueWords, 3)
  assert.equal(stats.longestWord, 2)
})

test('counts emoji as single characters but two code units', () => {
  const stats = analyzeText('😀')

  assert.equal(stats.characters, 1)
  assert.equal(stats.codeUnits, 2)
  assert.equal(stats.bytes, 4)
})

test('handles empty input without dividing by zero', () => {
  const stats = analyzeText('')

  assert.equal(stats.characters, 0)
  assert.equal(stats.words, 0)
  assert.equal(stats.readingMinutes, 0)
  assert.equal(stats.longestWord, 0)
})

test('estimates reading time from the word count', () => {
  const text = Array.from({ length: 600 }, (_, index) => `word${index}`).join(' ')

  assert.equal(analyzeText(text).words, 600)
  assert.equal(analyzeText(text).readingMinutes, 2)
  assert.equal(analyzeText(text, 100).readingMinutes, 6)
})
