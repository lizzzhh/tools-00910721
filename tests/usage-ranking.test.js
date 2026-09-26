import { strict as assert } from 'node:assert'
import test from 'node:test'
import { pickFavoriteTool, rankByUsage } from '../src/lib/usage-ranking.ts'

const tools = [{ id: 'hash' }, { id: 'json' }, { id: 'uuid' }, { id: 'text' }, { id: 'url' }, { id: 'base64' }]

test('sorts tools by usage count in descending order', () => {
  const ranked = rankByUsage(tools, { json: 3, hash: 8, uuid: 1 }, 6)

  assert.deepEqual(
    ranked.map((item) => item.tool.id),
    ['hash', 'json', 'uuid', 'text', 'url', 'base64']
  )
  assert.deepEqual(
    ranked.map((item) => item.rank),
    [1, 2, 3, 4, 5, 6]
  )
})

test('keeps only the requested number of leading tools', () => {
  const ranked = rankByUsage(tools, { base64: 9, hash: 8, json: 7, uuid: 6, text: 5, url: 4 })

  assert.equal(ranked.length, 5)
  assert.deepEqual(
    ranked.map((item) => item.tool.id),
    ['base64', 'hash', 'json', 'uuid', 'text']
  )
  assert.equal(ranked[4].count, 5)
})

test('treats unused tools as zero and keeps registry order for ties', () => {
  const ranked = rankByUsage(tools, {}, 5)

  assert.equal(ranked.every((item) => item.count === 0), true)
  assert.deepEqual(
    ranked.map((item) => item.tool.id),
    ['hash', 'json', 'uuid', 'text', 'url']
  )
})

test('ignores counts of unknown tools', () => {
  const ranked = rankByUsage(tools, { ghost: 99 }, 6)

  assert.deepEqual(
    ranked.map((item) => item.count),
    [0, 0, 0, 0, 0, 0]
  )
})

test('reports the most used tool', () => {
  assert.equal(pickFavoriteTool(tools, {})?.id, 'hash')
  assert.equal(pickFavoriteTool(tools, { url: 4, base64: 12 })?.id, 'base64')
  assert.equal(pickFavoriteTool([], { hash: 3 }), undefined)
})

test('supports a zero limit', () => {
  assert.deepEqual(rankByUsage(tools, { hash: 2 }, 0), [])
})
