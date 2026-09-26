import { strict as assert } from 'node:assert'
import test from 'node:test'
import { estimatePasswordStrength, generatePassword, PasswordGenerateError } from '../src/lib/security/passwords.ts'

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
  const noClass = { lowercase: false, uppercase: false, numbers: false, symbols: false }
  const tooShort = { ...allOptions }

  assert.throws(
    () => generatePassword(12, noClass, () => 0),
    (error) => error instanceof PasswordGenerateError && error.code === 'noCharacterClass'
  )
  assert.throws(
    () => generatePassword(2, tooShort, () => 0),
    (error) => error instanceof PasswordGenerateError && error.code === 'lengthBelowClassCount'
  )
  assert.throws(
    () => generatePassword(0, allOptions, () => 0),
    (error) => error instanceof PasswordGenerateError && error.code === 'lengthOutOfRange'
  )
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
