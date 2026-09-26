import { strict as assert } from 'node:assert'
import test from 'node:test'
import { dedupeLines, replaceText, shuffleLines, sortLines } from '../src/lib/text-lines.ts'

test('removes duplicate lines and reports the counts', () => {
  const result = dedupeLines('a\nb\na\nc\nb')

  assert.equal(result.ok, true)
  assert.equal(result.output, 'a\nb\nc')
  assert.equal(result.total, 5)
  assert.equal(result.kept, 3)
  assert.equal(result.removed, 2)
})

test('ignores case and surrounding whitespace when requested', () => {
  const result = dedupeLines('Apple\n apple \nAPPLE', { ignoreCase: true, trim: true })

  assert.equal(result.output, 'Apple')
  assert.equal(result.removed, 2)
})

test('sorts deduplicated lines when an order is provided', () => {
  const result = dedupeLines('b\na\nb', { sort: 'asc' })

  assert.equal(result.output, 'a\nb')
})

test('sorts lines by text, number, length and direction', () => {
  assert.equal(sortLines('b\na\nc').output, 'a\nb\nc')
  assert.equal(sortLines('b\na\nc', { order: 'desc' }).output, 'c\nb\na')
  assert.equal(sortLines('10\n2\n1', { mode: 'numeric' }).output, '1\n2\n10')
  assert.equal(sortLines('10\n2\n1', { mode: 'numeric', order: 'desc' }).output, '10\n2\n1')
  assert.equal(sortLines('bb\na\nccc', { mode: 'length' }).output, 'a\nbb\nccc')
  assert.equal(sortLines('a\na\nb', { unique: true }).output, 'a\nb')
})

test('sorts by natural string comparison when numeric parsing is incomplete', () => {
  const result = sortLines('v2\nv10\nv1', { mode: 'numeric' })

  assert.equal(result.output, 'v1\nv2\nv10')
})

test('shuffles lines while keeping every entry', () => {
  let seed = 0
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const result = shuffleLines('a\nb\nc\nd', random)

  assert.equal(result.total, 4)
  assert.equal(result.output.split('\n').sort().join(','), 'a,b,c,d')
})

test('replaces plain text with optional case and word boundaries', () => {
  const plain = replaceText('a-b-a', 'a', 'x')
  const insensitive = replaceText('Hello hello', 'hello', 'hi', { caseSensitive: false })
  const wholeWord = replaceText('cat concatenate cat', 'cat', 'dog', { wholeWord: true })

  assert.equal(plain.ok && plain.output, 'x-b-x')
  assert.equal(plain.matches, 2)
  assert.equal(insensitive.ok && insensitive.output, 'hi hi')
  assert.equal(wholeWord.ok && wholeWord.output, 'dog concatenate dog')
})

test('supports regular expressions with capture group references', () => {
  const result = replaceText('2026-01-31', '(\\d{4})-(\\d{2})-(\\d{2})', '$3/$2/$1', { regex: true })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.output, '31/01/2026')
  assert.equal(result.matches, 1)
  assert.deepEqual(result.groups, ['2026', '01', '31'])
})

test('treats plain text as literal characters', () => {
  const result = replaceText('a.c and abc', '.', '-')

  assert.equal(result.ok && result.output, 'a-c and abc')
})

test('reports an empty search pattern and invalid regular expressions', () => {
  const empty = replaceText('abc', '', 'x')
  const invalid = replaceText('abc', '(unclosed', 'x', { regex: true })

  assert.equal(empty.ok, false)
  if (!empty.ok) assert.match(empty.message, /请输入要查找的内容/)
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.match(invalid.message, /正则表达式无效/)
})

test('deletes matches when the replacement is empty', () => {
  const result = replaceText('a1b2c3', '\\d', '', { regex: true })

  assert.equal(result.ok && result.output, 'abc')
  assert.equal(result.ok && result.matches, 3)
})
