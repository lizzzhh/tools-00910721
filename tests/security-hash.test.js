import { strict as assert } from 'node:assert'
import { createHMAC, createSHA1, createSHA256, createSHA512 } from 'hash-wasm'
import test from 'node:test'

test('hash-wasm SHA implementations match known vectors', async () => {
  const sha1 = await createSHA1()
  sha1.update(new TextEncoder().encode('abc'))
  assert.equal(sha1.digest('hex'), 'a9993e364706816aba3e25717850c26c9cd0d89d')

  const sha256 = await createSHA256()
  sha256.update(new TextEncoder().encode('abc'))
  assert.equal(sha256.digest('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

  const sha512 = await createSHA512()
  sha512.update(new TextEncoder().encode('abc'))
  assert.equal(sha512.digest('hex'), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f')
})

test('hash-wasm HMAC matches a known vector', async () => {
  const hmac = await createHMAC(createSHA256(), new TextEncoder().encode('key'))
  hmac.update(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))
  assert.equal(hmac.digest('hex'), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
})
