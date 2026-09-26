export type SortOrder = 'asc' | 'desc'

export type SortMode = 'line' | 'numeric' | 'length'

export type LineOptions = {
  ignoreCase?: boolean
  trim?: boolean
  numeric?: boolean
}

export type LineResult = {
  ok: true
  output: string
  total: number
  kept: number
  removed: number
}

export type SortResult = LineResult & {
  order: SortOrder
}

export type ReplaceOptions = {
  regex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
}

/** Codes the UI maps to `toolUi.text-replace.errors.*`. */
export type ReplaceErrorCode = 'needInput' | 'invalidRegex'

export type ReplaceErrorParams = { message?: string }

export type ReplaceResult =
  | {
      ok: true
      output: string
      matches: number
      groups: string[]
    }
  | {
      ok: false
      code: ReplaceErrorCode
      params?: ReplaceErrorParams
    }

function splitLines(input: string) {
  return input.split(/\r\n|\r|\n/)
}

function prepareLine(line: string, options: LineOptions) {
  const trimmed = options.trim ? line.trim() : line
  return options.ignoreCase ? trimmed.toLowerCase() : trimmed
}

export function dedupeLines(input: string, options: LineOptions & { sort?: SortOrder } = {}): LineResult {
  const lines = splitLines(input)
  const seen = new Set<string>()
  const kept: string[] = []
  let removed = 0

  for (const line of lines) {
    const key = prepareLine(line, options)
    if (seen.has(key)) {
      removed += 1
      continue
    }
    seen.add(key)
    kept.push(options.trim ? line.trim() : line)
  }

  if (options.sort) kept.sort((left, right) => compareLines(left, right, options))

  return { ok: true, output: kept.join('\n'), total: lines.length, kept: kept.length, removed }
}

function compareNumbers(left: string, right: string) {
  const leftValue = Number.parseFloat(left.replace(/[^\d.+-]/g, ''))
  const rightValue = Number.parseFloat(right.replace(/[^\d.+-]/g, ''))
  const leftValid = Number.isFinite(leftValue)
  const rightValid = Number.isFinite(rightValue)
  if (leftValid && rightValid) return leftValue - rightValue
  if (leftValid) return -1
  if (rightValid) return 1
  return 0
}

function compareLines(left: string, right: string, options: LineOptions & { mode?: SortMode }) {
  const mode = options.mode ?? 'line'
  const leftValue = options.ignoreCase ? left.toLowerCase() : left
  const rightValue = options.ignoreCase ? right.toLowerCase() : right

  if (mode === 'numeric') return compareNumbers(leftValue, rightValue)
  if (mode === 'length') return leftValue.length - rightValue.length || (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

export function sortLines(input: string, options: LineOptions & { mode?: SortMode; order?: SortOrder; unique?: boolean } = {}): SortResult {
  const order = options.order ?? 'asc'
  const direction = order === 'desc' ? -1 : 1
  const lines = splitLines(input)
  const source = options.unique ? dedupeLines(input, options).output.split('\n') : lines

  const sorted = [...source].sort((left, right) => compareLines(left, right, options) * direction)

  return {
    ok: true,
    output: sorted.join('\n'),
    total: lines.length,
    kept: sorted.length,
    removed: lines.length - sorted.length,
    order
  }
}

export function shuffleLines(input: string, random: () => number = Math.random) {
  const lines = splitLines(input)
  const shuffled = [...lines]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[target]
    shuffled[target] = current
  }

  return { ok: true as const, output: shuffled.join('\n'), total: lines.length, kept: shuffled.length, removed: 0 }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceText(input: string, pattern: string, replacement: string, options: ReplaceOptions = {}): ReplaceResult {
  const { regex = false, caseSensitive = true, wholeWord = false } = options

  if (!pattern) return { ok: false, code: 'needInput' }

  let source = regex ? pattern : escapeRegExp(pattern)
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`
  const flags = caseSensitive ? 'gu' : 'giu'

  const createMatcher = () => {
    try {
      return new RegExp(source, flags)
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }

  const probe = createMatcher()
  if (probe instanceof Error) return { ok: false, code: 'invalidRegex', params: { message: probe.message } }

  let matches = 0
  const groups: string[] = []
  let match = probe.exec(input)

  while (match) {
    matches += 1
    for (let index = 1; index < match.length; index += 1) {
      const value = match[index]
      if (value !== undefined && value !== '' && !groups.includes(value)) groups.push(value)
    }
    if (match[0].length === 0) probe.lastIndex += 1
    match = probe.exec(input)
  }

  const output = input.replace(createMatcher() as RegExp, replacement)
  return { ok: true, output, matches, groups }
}
