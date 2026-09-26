import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decodeBase, decodeBase64, encodeBase, encodeBase64 } from '../src/lib/base64.ts'

test('encodes UTF-8 text as standard Base64', () => {
  const result = encodeBase64('Hello, 世界!')
  const symbols = encodeBase64('???>>')

  assert.equal(result.ok, true)
  assert.equal(symbols.ok, true)
  if (!result.ok || !symbols.ok) return
  assert.equal(result.output, 'SGVsbG8sIOS4lueVjCE=')
  assert.equal(result.byteLength, 14)
  assert.equal(symbols.output, 'Pz8/Pj4=')
})

test('encodes and decodes Base58 and Base62 text', () => {
  const base58 = encodeBase('Hello World!', 'base58')
  const base62 = encodeBase('Hello World!', 'base62')
  const base58Decoded = decodeBase('2NEpo7TZRRrLZSi2U', 'base58')
  const base62Decoded = decodeBase('T8dgcjRGkZ3aysdN', 'base62')
  const invalidBase58 = decodeBase('0OIl', 'base58')
  const invalidBase62 = decodeBase('!', 'base62')

  assert.equal(base58.ok, true)
  assert.equal(base62.ok, true)
  assert.equal(base58Decoded.ok, true)
  assert.equal(base62Decoded.ok, true)
  if (!base58.ok || !base62.ok || !base58Decoded.ok || !base62Decoded.ok) return
  assert.equal(base58.output, '2NEpo7TZRRrLZSi2U')
  assert.equal(base62.output, 'T8dgcjRGkZ3aysdN')
  assert.equal(base58Decoded.output, 'Hello World!')
  assert.equal(base62Decoded.output, 'Hello World!')
  assert.equal(invalidBase58.ok, false)
  assert.equal(invalidBase62.ok, false)

  for (const encoding of ['base58', 'base62']) {
    const encodedLeadingZero = encodeBase('\0Hello', encoding)
    assert.equal(encodedLeadingZero.ok, true)
    if (encodedLeadingZero.ok) {
      const decodedLeadingZero = decodeBase(encodedLeadingZero.output, encoding)
      assert.equal(decodedLeadingZero.ok, true)
      if (decodedLeadingZero.ok) assert.equal(decodedLeadingZero.output, '\0Hello')
    }
  }
})

test('encodes and decodes RFC 4648 Base32 text', () => {
  const vectors = [
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======']
  ]
  const decoded = decodeBase('mzxw6ytboi======', 'base32')
  const unpadded = decodeBase('MZXW6YTBOI', 'base32')
  const invalid = decodeBase('MZXW6Y', 'base32')
  const invalidPaddingBits = decodeBase('MZ', 'base32')
  const invalidPadding = decodeBase('MY=', 'base32')

  for (const [text, expected] of vectors) {
    const encoded = encodeBase(text, 'base32')
    assert.equal(encoded.ok, true)
    if (encoded.ok) assert.equal(encoded.output, expected)
  }
  assert.equal(decoded.ok, true)
  assert.equal(unpadded.ok, true)
  if (!decoded.ok || !unpadded.ok) return
  assert.equal(decoded.output, 'foobar')
  assert.equal(unpadded.output, 'foobar')
  assert.equal(invalid.ok, false)
  assert.equal(invalidPaddingBits.ok, false)
  assert.equal(invalidPadding.ok, false)
})

test('encodes and decodes Ascii85 text', () => {
  const encoded = encodeBase('Hello, World!', 'base85')
  const decoded = decodeBase('<~87cURD_*#4DfTZ)+T~>', 'base85')
  const zero = encodeBase('\0\0\0\0', 'base85')
  const invalid = decodeBase('v', 'base85')

  assert.equal(encoded.ok, true)
  assert.equal(decoded.ok, true)
  assert.equal(zero.ok, true)
  if (!encoded.ok || !decoded.ok || !zero.ok) return
  assert.equal(encoded.output, '87cURD_*#4DfTZ)+T')
  assert.equal(decoded.output, 'Hello, World!')
  assert.equal(zero.output, 'z')
  assert.equal(invalid.ok, false)
})

test('encodes and decodes Base91 text', () => {
  const text = 'Hello, World!\n'
  const encoded = encodeBase(text, 'base91')
  const decoded = decodeBase('>OwJh>}AQ;r@@Y?FF', 'base91')
  const invalid = decodeBase('-', 'base91')

  assert.equal(encoded.ok, true)
  assert.equal(decoded.ok, true)
  if (!encoded.ok || !decoded.ok) return
  assert.equal(encoded.output, '>OwJh>}AQ;r@@Y?FF')
  assert.equal(decoded.output, text)
  assert.equal(invalid.ok, false)
})

test('decodes standard and whitespace-padded Base64', () => {
  const standard = decodeBase64('SGVsbG8sIOS4lueVjCE=')
  const symbols = decodeBase64('Pz8/Pj4=')
  const spaced = decodeBase64('SGVs\nbG8s\tIOS4\nlueVjCE=')

  assert.equal(standard.ok, true)
  assert.equal(symbols.ok, true)
  assert.equal(spaced.ok, true)
  if (!standard.ok || !symbols.ok || !spaced.ok) return
  assert.equal(standard.output, 'Hello, 世界!')
  assert.equal(symbols.output, '???>>')
  assert.equal(spaced.output, 'Hello, 世界!')
  assert.equal(standard.byteLength, 14)
})

test('rejects URL-safe Base64 syntax', () => {
  const result = decodeBase64('Pz8_Pj4')

  assert.equal(result.ok, false)
  // errors surface a stable code; the UI resolves it to localized text
  if (!result.ok) {
    assert.equal(result.code, 'invalidChar')
    assert.deepEqual(result.params, { name: 'Base64' })
  }
})

test('rejects malformed Base64 and invalid UTF-8 output', () => {
  const invalidCharacter = decodeBase64('SGVsbG8*')
  const invalidLength = decodeBase64('SGVsbG8aA')
  const invalidUtf8 = decodeBase64('//79')
  const empty = decodeBase64(' \n ')

  assert.equal(invalidCharacter.ok, false)
  assert.equal(invalidLength.ok, false)
  assert.equal(invalidUtf8.ok, false)
  assert.equal(empty.ok, false)
  if (!invalidCharacter.ok) {
    assert.equal(invalidCharacter.position, 8)
    assert.equal(invalidCharacter.code, 'invalidChar')
    assert.deepEqual(invalidCharacter.params, { name: 'Base64' })
  }
  if (!invalidUtf8.ok) assert.equal(invalidUtf8.code, 'notUtf8')
  if (!empty.ok) assert.equal(empty.code, 'needInput')
})
