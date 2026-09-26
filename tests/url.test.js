import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decodeUrl, encodeUrl } from '../src/lib/url.ts'

test('encodes URL components and complete URLs with the selected rule', () => {
  const component = encodeUrl('https://例子.测试/path?a=1&b=hello world')
  const uri = encodeUrl('https://例子.测试/path?a=1&b=hello world', 'uri')

  assert.equal(component.ok, true)
  assert.equal(uri.ok, true)
  if (!component.ok || !uri.ok) return
  assert.equal(component.output, 'https%3A%2F%2F%E4%BE%8B%E5%AD%90.%E6%B5%8B%E8%AF%95%2Fpath%3Fa%3D1%26b%3Dhello%20world')
  assert.equal(uri.output, 'https://%E4%BE%8B%E5%AD%90.%E6%B5%8B%E8%AF%95/path?a=1&b=hello%20world')
})

test('decodes URL components and complete URLs', () => {
  const component = decodeUrl('https%3A%2F%2Fexample.com%2Fa%3Fb%3Dhello%20world')
  const uri = decodeUrl('https://example.com/a?b=hello%20world', 'uri')

  assert.equal(component.ok, true)
  assert.equal(uri.ok, true)
  if (!component.ok || !uri.ok) return
  assert.equal(component.output, 'https://example.com/a?b=hello world')
  assert.equal(uri.output, 'https://example.com/a?b=hello world')
})

test('reports malformed percent escapes and unencodable surrogate pairs', () => {
  const malformed = decodeUrl('https://example.com/%ZZ')
  const truncated = decodeUrl('https://example.com/%E4%BE')
  const loneSurrogate = encodeUrl('\uD800')

  assert.equal(malformed.ok, false)
  assert.equal(truncated.ok, false)
  assert.equal(loneSurrogate.ok, false)
  if (!malformed.ok) assert.equal(malformed.position, 21)
  if (!loneSurrogate.ok) assert.match(loneSurrogate.message, /无法编码/)
})
