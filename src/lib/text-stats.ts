export type TextStats = {
  characters: number
  charactersNoSpaces: number
  codeUnits: number
  words: number
  cjkWords: number
  lines: number
  nonEmptyLines: number
  paragraphs: number
  sentences: number
  letters: number
  cjk: number
  digits: number
  punctuation: number
  whitespace: number
  bytes: number
  uniqueWords: number
  longestWord: number
  readingMinutes: number
}

const cjkPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/
const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu
const cjkWordPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+/gu
const sentencePattern = /[^.!?。！？…\n]+[.!?。！？…]*|\n+/gu

export function analyzeText(input: string, wordsPerMinute = 300): TextStats {
  const characters = Array.from(input)
  const lines = input.split(/\r\n|\r|\n/)
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
  const paragraphs = input.split(/(?:\r\n|\r|\n){2,}/).filter((paragraph) => paragraph.trim().length > 0)

  let letters = 0
  let cjk = 0
  let digits = 0
  let punctuation = 0
  let whitespace = 0
  let charactersNoSpaces = 0

  for (const character of characters) {
    if (/\s/u.test(character)) whitespace += 1
    else charactersNoSpaces += 1

    if (cjkPattern.test(character)) cjk += 1
    else if (/\p{L}/u.test(character)) letters += 1
    else if (/\p{N}/u.test(character)) digits += 1
    else if ((character.codePointAt(0) ?? 0) > 0x20) punctuation += 1
  }

  const latinWords = (input.match(wordPattern) ?? []).filter((word) => !cjkPattern.test(word[0]))
  const cjkWords = input.match(cjkWordPattern) ?? []
  const words = latinWords.length + cjkWords.length
  const uniqueWords = new Set(latinWords.map((word) => word.toLowerCase())).size + new Set(cjkWords).size
  const longestWord = Math.max(0, ...[...latinWords, ...cjkWords].map((word) => word.length))
  const sentences = (input.match(sentencePattern) ?? []).filter((sentence) => sentence.trim().length > 0 && !/^\n+$/.test(sentence)).length

  return {
    characters: characters.length,
    charactersNoSpaces,
    codeUnits: input.length,
    words,
    cjkWords: cjkWords.length,
    lines: lines.length,
    nonEmptyLines: nonEmptyLines.length,
    paragraphs: paragraphs.length,
    sentences,
    letters,
    cjk,
    digits,
    punctuation,
    whitespace,
    bytes: new TextEncoder().encode(input).byteLength,
    uniqueWords,
    longestWord,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / wordsPerMinute))
  }
}
