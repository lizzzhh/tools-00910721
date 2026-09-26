import { strict as assert } from 'node:assert'
import test from 'node:test'
import { estimatePasswordStrength, generatePassword } from '../src/lib/security/passwords.ts'

const allOptions = { lowercase: true, uppercase: true, numbers: true, symbols: true }

test('generates a password with every selected character class', () => {
  let value = 0
  const password = generatePassword(24, allOptions, () => value++ % 256)

  assert.equal(password.length, 24)
  assert.match(password, /[a-z]/)
  assert.match(password, /[A-Z]/)
  assert.match(password, /[0-9]/)
  assert.ok([...password].some((character) => '!@#$%^&*()-_=+[]{};:,.<>?/'.includes(character)))
})

test('rejects invalid password generation options', () => {
  assert.throws(() => generatePassword(12, { lowercase: false, uppercase: false, numbers: false, symbols: false }, () => 0), /至少选择/)
  assert.throws(() => generatePassword(2, allOptions, () => 0), /长度不能/)
})

test('penalizes common passwords and rewards varied long passwords', () => {
  const common = estimatePasswordStrength('password1')
  const varied = estimatePasswordStrength('N7!vQ2@rL9#xT4$uP6^&')

  assert.ok(common.score < 35)
  assert.ok(varied.score > common.score)
  assert.equal(varied.length, 20)
  assert.equal(varied.uniqueCharacters, 20)
  assert.ok(varied.entropy > common.entropy)
})
