/**
 * Line ordering for the sort tool.
 *
 * The comparators are here rather than in the page because "sort lines" has three
 * answers that people disagree about and one of them is the default: `2` before
 * `10` or not. Plain lexical sort says `10` first, numeric sort says `2`, and
 * natural sort says `2` while still keeping `item-2` next to `item-10` instead
 * of at the far end.
 */

/** Display names live in the dictionaries as `toolUi.text-sort.keys.*`. */
export const sortKeyIds = ['lexical', 'numeric', 'natural', 'length', 'random'] as const
export type SortKey = (typeof sortKeyIds)[number]

export type SortOptions = {
  key: SortKey
  descending?: boolean
  caseSensitive?: boolean
  trim?: boolean
  dedupe?: boolean
  ignoreEmpty?: boolean
  /** Lines starting with this are pinned above the rest, as in a real config. */
  pinnedPrefix?: string
}

export type SortResult = {
  ok: true
  lines: string[]
  /** Lines whose position changed, which is what "sorted" actually means. */
  moved: number
  total: number
  unique: number
}

function fold(line: string, options: SortOptions) {
  const trimmed = options.trim ? line.trim() : line
  return options.caseSensitive ? trimmed : trimmed.toLocaleLowerCase()
}

/** Numeric text runs, which is what makes `item2` sort next to `item10`. */
const chunkPattern = /(\d+)|(\D+)/g

function naturalCompare(a: string, b: string) {
  const left = a.match(chunkPattern) ?? []
  const right = b.match(chunkPattern) ?? []
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const x = left[index]
    const y = right[index]
    const xa = /^\d/.test(x)
    const ya = /^\d/.test(y)
    if (xa && ya) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff
      // Same value, different spelling: `02` before `2` so the order is stable.
      if (x.length !== y.length) return x.length - y.length
      continue
    }
    if (x !== y) return x < y ? -1 : 1
  }
  return left.length - right.length
}

function compareWith(key: SortKey, a: string, b: string): number {
  switch (key) {
    case 'numeric': {
      const x = Number(a)
      const y = Number(b)
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y
      // A line that is not a number at all falls back to text, rather than
      // pretending it is zero and putting it between `-1` and `1`.
      if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1
      return a < b ? -1 : a > b ? 1 : 0
    }
    case 'natural':
      return naturalCompare(a, b)
    case 'length':
      return a.length - b.length
    case 'lexical':
    case 'random':
    default:
      return a < b ? -1 : a > b ? 1 : 0
  }
}

function sortStable<T>(items: T[], compare: (a: T, b: T) => number) {
  // Decorated with the original index, because `Array.sort` is specified as
  // stable from ES2019 but nothing stops an engine from changing its mind.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map((entry) => entry.item)
}

export function sortLines(input: string, options: SortOptions): SortResult {
  const source = input.replace(/\r\n?/g, '\n').split('\n')
  const pin = options.pinnedPrefix ?? ''
  const pinnedLine = (line: string) => pin !== '' && line.startsWith(pin)
  const prepared = (options.trim ? source.map((line) => line.trim()) : source).filter(
    (line) => !(options.ignoreEmpty && line.trim() === '' && !pinnedLine(line))
  )

  const unique = options.dedupe ? Array.from(new Set(prepared)) : prepared
  const pinned = pin === '' ? [] : unique.filter(pinnedLine)
  const rest = pin === '' ? unique : unique.filter((line) => !pinnedLine(line))

  const foldedRest = rest.map((line) => ({ line, key: fold(line, options) }))
  const direction = options.descending ? -1 : 1
  const sortedRest = sortStable(foldedRest, (a, b) => {
    const result = compareWith(options.key, a.key, b.key)
    return result === 0 ? 0 : result * direction
  })
  if (options.key === 'random') sortedRest.sort(() => Math.random() - 0.5)

  const lines = [...pinned, ...sortedRest.map((entry) => entry.line)]
  const moved = lines.reduce((count, line, index) => (source[index] === line ? count : count + 1), 0)
  return { ok: true, lines, moved, total: prepared.length, unique: unique.length }
}

/** Counts of each duplicate run, so the page can say what was collapsed. */
export function duplicateCounts(lines: string[]): { line: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([line, count]) => ({ line, count }))
    .sort((a, b) => b.count - a.count || (a.line < b.line ? -1 : 1))
}