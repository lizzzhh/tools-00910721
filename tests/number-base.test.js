import { strict as assert } from 'node:assert'
import test from 'node:test'
import { convertNumber, isNumberBase } from '../src/lib/number-base.ts'

test('converts a decimal value into every supported base', () => {
  const result = convertNumber('255', 10)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.digits[2], '11111111')
  assert.equal(result.digits[8], '377')
  assert.equal(result.digits[10], '255')
  assert.equal(result.digits[16], 'FF')
  assert.equal(result.digits[32], '7V')
  assert.equal(result.digits[36], '73')
  assert.equal(result.value, 255n)
})

test('accepts radix prefixes, separators, sign and letter case', () => {
  const hex = convertNumber('0xFF', 16)
  const spaced = convertNumber('1010 1010', 2)
  const negative = convertNumber('-1A', 16)
  const separated = convertNumber('1_000', 10)

  assert.equal(hex.ok && hex.digits[10], '255')
  assert.equal(spaced.ok && spaced.digits[10], '170')
  assert.equal(negative.ok && negative.digits[2], '-11010')
  assert.equal(negative.ok && negative.negative, true)
  assert.equal(separated.ok && separated.digits[16], '3E8')
})

test('rejects digits that are out of range for the selected base', () => {
  const binary = convertNumber('102', 2)
  const decimal = convertNumber('12a', 10)

  assert.equal(binary.ok, false)
  if (!binary.ok) {
    assert.match(binary.message, /不是 2 进制的有效数字/)
    assert.equal(binary.position, 3)
  }
  assert.equal(decimal.ok, false)
})

test('rejects empty input, bare prefixes and fractional values', () => {
  const empty = convertNumber('  ', 10)
  const barePrefix = convertNumber('0x', 16)
  const fraction = convertNumber('1.5', 10)

  assert.equal(empty.ok, false)
  assert.equal(barePrefix.ok, false)
  assert.equal(fraction.ok, false)
  if (!fraction.ok) assert.match(fraction.message, /仅支持整数/)
})

test('identifies supported bases', () => {
  assert.equal(isNumberBase('16'), true)
  assert.equal(isNumberBase('7'), false)
})
