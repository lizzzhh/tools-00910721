import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decodeJwt } from '../src/lib/security/jwt.ts'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

test('decodes a JWT header and payload', () => {
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', exp: 2_000_000_000 })}.signature`
  const result = decodeJwt(token, 1_900_000_000_000)

  assert.equal(result.ok, true)
  assert.equal(result.kind, 'jwt')
  assert.equal(result.payload.sub, 'user-1')
  assert.equal(result.status, 'valid')
  assert.equal(result.expiresAt, 2_000_000_000)
})

test('reports expired and not-yet-valid tokens', () => {
  const expired = decodeJwt(`${encode({ alg: 'none' })}.${encode({ exp: 100 })}.`, 101_000)
  assert.equal(expired.ok, true)
  assert.equal(expired.status, 'expired')

  const future = decodeJwt(`${encode({ alg: 'none' })}.${encode({ nbf: 200 })}.`, 100_000)
  assert.equal(future.ok, true)
  assert.equal(future.status, 'not-yet-valid')
})

test('recognizes encrypted JWE tokens and rejects malformed tokens', () => {
  const jwe = decodeJwt(`${encode({ alg: 'dir', enc: 'A256GCM' })}..iv.ciphertext.tag`)
  assert.equal(jwe.ok, true)
  assert.equal(jwe.kind, 'jwe')
  assert.equal(jwe.payload, null)

  assert.equal(decodeJwt('not-a-jwt').ok, false)
  assert.equal(decodeJwt('a.b').ok, false)
})
