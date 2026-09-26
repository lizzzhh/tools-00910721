export type CaseStyle =
  | 'upper'
  | 'lower'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'train'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'
  | 'path'
  | 'alternating'
  | 'reverse'
  | 'first-upper'

export type TextResult = {
  ok: true
  output: string
  words: number
  converted: number
}

const separatorPattern = /[^\p{L}\p{N}]+/u

export const caseStyleLabels: Record<CaseStyle, string> = {
  upper: '全部大写',
  lower: '全部小写',
  title: '单词首字母大写',
  sentence: '句首字母大写',
  camel: 'camelCase',
  pascal: 'PascalCase',
  train: 'train-case',
  snake: 'snake_case',
  kebab: 'kebab-case',
  constant: 'CONSTANT_CASE',
  dot: 'dot.case',
  path: 'path/case',
  alternating: 'aLtErNaTiNg',
  reverse: '反转字符顺序',
  'first-upper': '首字母大写'
}

export const caseStyleHints: Record<CaseStyle, string> = {
  upper: 'HELLO WORLD',
  lower: 'hello world',
  title: 'Hello World',
  sentence: 'Hello world',
  camel: 'helloWorld',
  pascal: 'HelloWorld',
  train: 'Hello-World',
  snake: 'hello_world',
  kebab: 'hello-world',
  constant: 'HELLO_WORLD',
  dot: 'hello.world',
  path: 'hello/world',
  alternating: 'hElLo WoRlD',
  reverse: 'dlroW olleH',
  'first-upper': 'Hello world'
}

function splitChunk(chunk: string) {
  const characters = Array.from(chunk)
  const parts: string[] = []
  let current = ''

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const previous = characters[index - 1]
    const next = characters[index + 1]

    if (current && previous && next) {
      const lowerToUpper = /\p{Ll}/u.test(previous) && /\p{Lu}/u.test(character)
      const acronymToWord = /\p{Lu}/u.test(previous) && /\p{Lu}/u.test(character) && /\p{Ll}/u.test(next)
      if (lowerToUpper || acronymToWord) {
        parts.push(current)
        current = ''
      }
    }

    current += character
  }

  if (current) parts.push(current)
  return parts
}

export function splitWords(input: string) {
  const chunks = input.split(separatorPattern).filter((chunk) => chunk.length > 0)
  return chunks.flatMap((chunk) => splitChunk(chunk))
}

function capitalize(word: string) {
  const characters = Array.from(word)
  const first = characters[0]
  return first ? first.toUpperCase() + characters.slice(1).join('').toLowerCase() : ''
}

function joinBy(words: string[], separator: string) {
  return words.join(separator)
}

export function convertCase(input: string, style: CaseStyle): TextResult {
  if (style === 'reverse') {
    return { ok: true, output: Array.from(input).reverse().join(''), words: splitWords(input).length, converted: input.length }
  }

  if (style === 'first-upper') {
    const characters = Array.from(input)
    const first = characters[0]
    return { ok: true, output: first ? first.toUpperCase() + characters.slice(1).join('') : '', words: splitWords(input).length, converted: first ? 1 : 0 }
  }

  const words = splitWords(input)
  if (words.length === 0) return { ok: true, output: '', words: 0, converted: 0 }

  let output = ''
  switch (style) {
    case 'upper':
      output = input.toUpperCase()
      break
    case 'lower':
      output = input.toLowerCase()
      break
    case 'title':
      output = joinBy(
        words.map((word) => (isCased(word) ? capitalize(word) : word)),
        ' '
      )
      break
    case 'sentence': {
      const [first, ...rest] = words
      output = isCased(first) ? capitalize(first) : first.toLowerCase()
      if (rest.length > 0) output += ` ${rest.map((word) => word.toLowerCase()).join(' ')}`
      break
    }
    case 'camel':
      output = words.map((word, index) => (isCased(word) ? (index === 0 ? word.toLowerCase() : capitalize(word)) : word)).join('')
      break
    case 'pascal':
    case 'train':
      output = words.map((word) => (isCased(word) ? capitalize(word) : word)).join(style === 'train' ? '-' : '')
      break
    case 'snake':
    case 'kebab':
    case 'dot':
    case 'path':
      output = joinBy(
        words.map((word) => word.toLowerCase()),
        style === 'snake' ? '_' : style === 'kebab' ? '-' : style === 'dot' ? '.' : '/'
      )
      break
    case 'constant':
      output = joinBy(
        words.map((word) => word.toUpperCase()),
        '_'
      )
      break
    case 'alternating':
      output = Array.from(input)
        .map((character, index) => (index % 2 === 0 ? character.toUpperCase() : character.toLowerCase()))
        .join('')
      break
  }

  return { ok: true, output, words: words.length, converted: output === input ? 0 : input.length }
}

function isCased(word: string) {
  return /^\p{L}/u.test(word)
}
