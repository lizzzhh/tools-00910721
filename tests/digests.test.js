import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createHashHashers } from '../src/lib/security/digests.ts'

test('multi-hash digests match known vectors', async () => {
  const hashers = await createHashHashers(['md5', 'sha-1', 'sha-224', 'sha-256', 'sha-384', 'sha-512'])
  hashers.forEach((hasher) => hasher.update(new TextEncoder().encode('abc')))
  assert.equal(hashers.get('md5')?.digest('hex'), '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(hashers.get('sha-1')?.digest('hex'), 'a9993e364706816aba3e25717850c26c9cd0d89d')
  assert.equal(hashers.get('sha-224')?.digest('hex'), '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7')
  assert.equal(hashers.get('sha-256')?.digest('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(hashers.get('sha-384')?.digest('hex'), 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7')
  assert.equal(hashers.get('sha-512')?.digest('hex'), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f')
})

test('multi-hash HMAC variants match known vectors', async () => {
  const md5Key = '\u000b'.repeat(16)
  const sha1Key = '\u000b'.repeat(20)

  const md5 = await createHashHashers(['hmac-md5'], md5Key)
  md5.get('hmac-md5')?.update(new TextEncoder().encode('Hi There'))
  assert.equal(md5.get('hmac-md5')?.digest('hex'), '9294727a3638bb1c13f48ef8158bfc9d')

  const sha1 = await createHashHashers(['hmac-sha-1'], sha1Key)
  sha1.get('hmac-sha-1')?.update(new TextEncoder().encode('Hi There'))
  assert.equal(sha1.get('hmac-sha-1')?.digest('hex'), 'b617318655057264e28bc0b6fb378c8ef146be00')

  const sha256 = await createHashHashers(['hmac-sha-256'], 'key')
  sha256.get('hmac-sha-256')?.update(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))
  assert.equal(sha256.get('hmac-sha-256')?.digest('hex'), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
})