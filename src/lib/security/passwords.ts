export type PasswordOptions = {
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
}

export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'strong' | 'excellent'

/** Codes the UI maps to `toolUi.password-strength.levels.*` / `notes.*` / `advice.*`. */
export type PasswordNoteCode =
  | 'lengthTwelve'
  | 'classCount'
  | 'lowRepeat'
  | 'usePasswordManager'
  | 'atLeastTwelve'
  | 'mixClasses'
  | 'avoidRepeats'
  | 'avoidSequences'
  | 'avoidYear'
  | 'avoidCommon'
  | 'needInput'

export type PasswordNote = { code: PasswordNoteCode; params?: { count: number } }

/** Thrown by `generatePassword`; the UI maps these to `toolUi.password-generator.errors.*`. */
export class PasswordGenerateError extends Error {
  code: PasswordGenerateErrorCode

  constructor(code: PasswordGenerateErrorCode) {
    super(code)
    this.name = 'PasswordGenerateError'
    this.code = code
  }
}

export type PasswordGenerateErrorCode = 'noSecureRandom' | 'lengthOutOfRange' | 'noCharacterClass' | 'lengthBelowClassCount'

export type PasswordStrengthResult = {
  score: number
  level: PasswordStrengthLevel
  entropy: number
  poolSize: number
  length: number
  uniqueCharacters: number
  notes: PasswordNote[]
  advice: PasswordNote[]
}

export const defaultPasswordOptions: PasswordOptions = {
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true
}

const characterGroups = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/'
}

const commonPasswords = new Set([
  '123456', '123456789', '12345678', '1234567890', '111111', '000000', '121212',
  'password', 'password1', 'qwerty', 'qwerty123', 'abc123', 'letmein', 'admin',
  'iloveyou', 'welcome', 'monkey', 'dragon', 'football', 'baseball', 'passw0rd'
])

const sequencePattern = /(0123456789|1234567890|abcdefghijklmnopqrstuvwxyz|qwertyuiop|asdfghjkl|zxcvbnm)/i
const repeatedPattern = /(.)\1{2,}/

function secureRandomByte() {
  if (!globalThis.crypto?.getRandomValues) throw new PasswordGenerateError('noSecureRandom')
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return values[0] & 0xff
}

function randomIndex(limit: number, randomByte: () => number) {
  const maximum = 256 - (256 % limit)
  let value = randomByte()
  while (value >= maximum) value = randomByte()
  return value % limit
}

export function getPasswordCharacterPool(options: PasswordOptions) {
  return [
    options.lowercase ? characterGroups.lowercase : '',
    options.uppercase ? characterGroups.uppercase : '',
    options.numbers ? characterGroups.numbers : '',
    options.symbols ? characterGroups.symbols : ''
  ].join('')
}

export function generatePassword(length: number, options: PasswordOptions, randomByte: () => number = secureRandomByte) {
  if (!Number.isInteger(length) || length < 1 || length > 512) throw new PasswordGenerateError('lengthOutOfRange')
  const groups = [
    options.lowercase ? characterGroups.lowercase : '',
    options.uppercase ? characterGroups.uppercase : '',
    options.numbers ? characterGroups.numbers : '',
    options.symbols ? characterGroups.symbols : ''
  ].filter(Boolean)
  if (!groups.length) throw new PasswordGenerateError('noCharacterClass')
  if (length < groups.length) throw new PasswordGenerateError('lengthBelowClassCount')

  const characters = groups.map((group) => group[randomIndex(group.length, randomByte)])
  const pool = groups.join('')
  while (characters.length < length) characters.push(pool[randomIndex(pool.length, randomByte)])
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, randomByte)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }
  return characters.join('')
}

function hasCharacterClass(password: string, pattern: RegExp) {
  return pattern.test(password)
}

export function estimatePasswordStrength(password: string): PasswordStrengthResult {
  const characters = Array.from(password)
  const length = characters.length
  if (!length) {
    return {
      score: 0,
      level: 'empty',
      entropy: 0,
      poolSize: 0,
      length: 0,
      uniqueCharacters: 0,
      notes: [],
      advice: [{ code: 'needInput' }]
    }
  }

  const hasLowercase = hasCharacterClass(password, /[a-z]/)
  const hasUppercase = hasCharacterClass(password, /[A-Z]/)
  const hasNumber = hasCharacterClass(password, /[0-9]/)
  const hasSymbol = [...password].some((character) => !/[A-Za-z0-9\s]/.test(character))
  const classCount = [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length
  const poolSize = (hasLowercase ? 26 : 0) + (hasUppercase ? 26 : 0) + (hasNumber ? 10 : 0) + (hasSymbol ? 32 : 0)
  const uniqueCharacters = new Set(characters).size
  const entropy = length * Math.log2(Math.max(poolSize, 1))
  const normalized = password.toLocaleLowerCase()
  const common = commonPasswords.has(normalized)
  const repeated = repeatedPattern.test(password)
  const sequence = sequencePattern.test(password)
  const year = /(19|20)\d{2}/.test(password)
  let score = Math.min(100, Math.round(entropy * 1.35))

  if (length < 8) score -= 24 - (8 - length) * 3
  if (classCount === 1) score -= 15
  if (uniqueCharacters / length < 0.45) score -= 18
  if (repeated) score -= 18
  if (sequence) score -= 22
  if (year) score -= 10
  if (common) score = Math.min(score, 12)
  score = Math.max(0, Math.min(100, score))

  const level: PasswordStrengthLevel = score < 35 ? 'weak' : score < 60 ? 'fair' : score < 80 ? 'strong' : 'excellent'
  const notes: PasswordNote[] = []
  const advice: PasswordNote[] = []
  if (length >= 12) notes.push({ code: 'lengthTwelve' })
  if (classCount >= 3) notes.push({ code: 'classCount', params: { count: classCount } })
  if (uniqueCharacters / length >= 0.7) notes.push({ code: 'lowRepeat' })
  if (length < 12) advice.push({ code: 'atLeastTwelve' })
  if (classCount < 3) advice.push({ code: 'mixClasses' })
  if (repeated) advice.push({ code: 'avoidRepeats' })
  if (sequence) advice.push({ code: 'avoidSequences' })
  if (year) advice.push({ code: 'avoidYear' })
  if (common) advice.push({ code: 'avoidCommon' })
  if (!advice.length) advice.push({ code: 'usePasswordManager' })

  return {
    score,
    level,
    entropy: Math.round(entropy * 10) / 10,
    poolSize,
    length,
    uniqueCharacters,
    notes,
    advice
  }
}
