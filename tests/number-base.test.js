import { strict as assert } from 'node:assert'
import test from 'node:test'
import { basePrefix, commonBases, convertNumber, detectBase, isNumberBase, numberBases, toDigits } from '../src/lib/number-base.ts'

test('converts a decimal value into the common bases', () => {
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

test('supports every radix from 2 to 36', () => {
  const result = convertNumber('1000', 10)

  assert.equal(result.ok, true)
  if (!result.ok) return
  for (const base of numberBases) {
    assert.equal(typeof result.digits[base], 'string', `缺少 ${base} 进制结果`)
    if (base <= 36) assert.equal(result.digits[base], toDigits(BigInt(1000), base))
  }
  assert.equal(result.digits[3], '1101001')
  assert.equal(result.digits[7], '2626')
  assert.equal(result.digits[12], '6B4')
  assert.equal(result.digits[31], '118')
})

test('formats Base58 and Base62 with their own alphabets', () => {
  const result = convertNumber('255', 10)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.digits[58], '5Q')
  assert.equal(result.digits[62], '47')
  assert.equal(toDigits(0n, 58), '0')
  assert.equal(toDigits(58n, 58), '21')
  assert.equal(toDigits(57n, 58), 'z')
  // Bitcoin Base58 omits the ambiguous glyphs 0, O, I and l.
  assert.equal(/[0OIl]/.test(result.digits[58]), false)
  assert.equal(toDigits(12345678901234567890n, 62), 'EhzL6HwZ5ow')
})

test('accepts radix prefixes, separators, sign and letter case', () => {
  const hex = convertNumber('0xFF', 16)
  const auto = convertNumber('0xFF', detectBase('0xFF'))
  const spaced = convertNumber('1010 1010', 2)
  const negative = convertNumber('-1A', 16)
  const separated = convertNumber('1_000', 10)

  assert.equal(hex.ok && hex.digits[10], '255')
  assert.equal(auto.ok && auto.digits[10], '255')
  assert.equal(spaced.ok && spaced.digits[10], '170')
  assert.equal(negative.ok && negative.digits[2], '-11010')
  assert.equal(negative.ok && negative.negative, true)
  assert.equal(negative.ok && negative.digits[62].startsWith('-'), true)
  assert.equal(separated.ok && separated.digits[16], '3E8')
})

test('detects the input base from radix prefixes', () => {
  assert.equal(detectBase('0b1010'), 2)
  assert.equal(detectBase('0o17'), 8)
  assert.equal(detectBase('0x4d2'), 16)
  assert.equal(detectBase('-0XFF'), 16)
  assert.equal(detectBase('1234567890'), 10)
  assert.equal(basePrefix(2) + '1010', '0b1010')
  assert.equal(basePrefix(16) + 'FF', '0xFF')
})

test('rejects digits that are out of range for the selected base', () => {
  const binary = convertNumber('102', 2)
  const ternary = convertNumber('103', 3)
  const decimal = convertNumber('12a', 10)
  const base62 = convertNumber('l0O', 62)

  assert.equal(binary.ok, false)
  if (!binary.ok) {
    assert.equal(binary.code, 'invalidDigit')
    assert.equal(binary.char, '2')
    assert.equal(binary.base, 2)
    assert.equal(binary.position, 3)
  }
  assert.equal(ternary.ok, false)
  assert.equal(decimal.ok, false)
  // Base62 accepts 0, O and l; only the literal alphabet matters, not the exclusions.
  assert.equal(base62.ok, true)
})

test('rejects empty input, bare prefixes and fractional values', () => {
  const empty = convertNumber('  ', 10)
  const barePrefix = convertNumber('0x', 16)
  const fraction = convertNumber('1.5', 10)

  assert.equal(empty.ok, false)
  assert.equal(barePrefix.ok, false)
  assert.equal(fraction.ok, false)
  if (!fraction.ok) {
    assert.equal(fraction.code, 'decimalNotSupported')
    assert.equal(fraction.position, 2)
  }
})

test('identifies supported bases and rejects out-of-range ones', () => {
  assert.equal(isNumberBase('16'), true)
  assert.equal(isNumberBase('7'), true)
  assert.equal(isNumberBase('36'), true)
  assert.equal(isNumberBase('58'), true)
  assert.equal(isNumberBase('62'), true)
  assert.equal(isNumberBase('1'), false)
  assert.equal(isNumberBase('0'), false)
  assert.equal(isNumberBase('40'), false)
  assert.equal(isNumberBase('64'), false)
  assert.equal(isNumberBase('2.5'), false)
  assert.equal(commonBases.length, 8)
  assert.equal(numberBases.length, 37)
})

test('keeps arbitrary precision beyond the safe integer range', () => {
  const huge = '123456789012345678901234567890123456789'
  const result = convertNumber(huge, 10)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.digits[10], huge)
  assert.equal(result.digits[16], '5CE0E9A56015FEC5AADFA328AE398115')
  // round-trips back through another radix
  assert.equal(convertNumber(result.digits[16], 16).ok && convertNumber(result.digits[16], 16).digits[10], huge)
})

test('refuses to format bases outside the supported range', () => {
  assert.throws(() => toDigits(10n, 64), RangeError)
  assert.throws(() => toDigits(10n, 1), RangeError)
})
