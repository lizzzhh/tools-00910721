import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import test from 'node:test'
import CryptoJS from 'crypto-js'

function nodeMd5(value) {
  return createHash('md5').update(value).digest('hex')
}

test('CryptoJS MD5 matches Node.js for ASCII and UTF-8 text', () => {
  const samples = ['', 'hello world', 'The quick brown fox jumps over the lazy dog', '码间 · 你好 👋']
  for (const sample of samples) {
    assert.equal(CryptoJS.MD5(sample).toString(), nodeMd5(sample))
  }
})

test('CryptoJS MD5 matches Node.js for binary data', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index)
  const wordArray = CryptoJS.lib.WordArray.create(bytes)
  assert.equal(CryptoJS.MD5(wordArray).toString(), nodeMd5(bytes))
})
