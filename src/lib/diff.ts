/**
 * Line diffing, for the two-pane compare.
 *
 * Plain longest-common-subsequence: the diff people expect is the one that keeps
 * the lines they did not touch exactly where they were. Two things make that
 * affordable on real input. The common prefix and suffix are peeled off first,
 * which is most of a real comparison, and the DP table is a flat `Uint16Array`
 * over the remainder rather than an array of arrays.
 */

export type DiffKind = 'same' | 'added' | 'removed'

export type DiffRow = {
  kind: DiffKind
  text: string
  /** 1-based line numbers, or null where that side has no line. */
  left: number | null
  right: number | null
}

export type DiffOptions = {
  ignoreCase?: boolean
  ignoreWhitespace?: boolean
  ignoreBlankLines?: boolean
}

export type DiffResult =
  | { ok: true; rows: DiffRow[]; added: number; removed: number; same: number; identical: boolean }
  | { ok: false; code: 'tooLarge'; lines: number }

/** Past this many cells the table would cost more than the answer is worth. */
const cellBudget = 4_000_000

function splitLines(text: string) {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

/** The key a line is compared by, which is what the ignore options actually mean. */
function comparable(line: string, options: DiffOptions) {
  let out = line
  if (options.ignoreWhitespace) out = out.replace(/\s+/g, ' ').trim()
  if (options.ignoreCase) out = out.toLowerCase()
  return out
}

/**
 * Walks the table backwards to recover the edit script. Going forwards would need
 * the whole table held twice, because each cell is only the length of the common
 * run ending there, which says nothing about where to go next.
 */
function recover(left: string[], right: string[], options: DiffOptions): DiffRow[] {
  const rows: DiffRow[] = []
  let prefix = 0
  while (prefix < left.length && prefix < right.length && comparable(left[prefix], options) === comparable(right[prefix], options)) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    comparable(left[left.length - 1 - suffix], options) === comparable(right[right.length - 1 - suffix], options)
  ) {
    suffix += 1
  }

  for (let index = 0; index < prefix; index += 1) {
    rows.push({ kind: 'same', text: left[index], left: index + 1, right: index + 1 })
  }

  const midLeft = left.slice(prefix, left.length - suffix)
  const midRight = right.slice(prefix, right.length - suffix)
  const rows_ = midLeft.length + 1
  const cols = midRight.length + 1
  if (rows_ * cols > cellBudget) return []

  const table = new Uint16Array(rows_ * cols)
  for (let i = midLeft.length - 1; i >= 0; i -= 1) {
    for (let j = midRight.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        comparable(midLeft[i], options) === comparable(midRight[j], options)
          ? table[(i + 1) * cols + (j + 1)] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + (j + 1)])
    }
  }

  let i = 0
  let j = 0
  while (i < midLeft.length && j < midRight.length) {
    if (comparable(midLeft[i], options) === comparable(midRight[j], options)) {
      rows.push({ kind: 'same', text: midLeft[i], left: prefix + i + 1, right: prefix + j + 1 })
      i += 1
      j += 1
      continue
    }
    if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      rows.push({ kind: 'removed', text: midLeft[i], left: prefix + i + 1, right: null })
      i += 1
    } else {
      rows.push({ kind: 'added', text: midRight[j], left: null, right: prefix + j + 1 })
      j += 1
    }
  }
  while (i < midLeft.length) {
    rows.push({ kind: 'removed', text: midLeft[i], left: prefix + i + 1, right: null })
    i += 1
  }
  while (j < midRight.length) {
    rows.push({ kind: 'added', text: midRight[j], left: null, right: prefix + j + 1 })
    j += 1
  }

  for (let index = 0; index < suffix; index += 1) {
    rows.push({
      kind: 'same',
      text: left[left.length - suffix + index],
      left: left.length - suffix + index + 1,
      right: right.length - suffix + index + 1
    })
  }
  return rows
}

export function diffLines(before: string, after: string, options: DiffOptions = {}): DiffResult {
  // An empty side has no lines at all; `''.split('\n')` would call it one blank
  // line and every later count would be off by one.
  const left = before === '' ? [] : splitLines(before)
  const right = after === '' ? [] : splitLines(after)
  const total = left.length + right.length
  if (total * total > cellBudget) return { ok: false, code: 'tooLarge', lines: total }

  const rows = recover(left, right, options)
  const kept = options.ignoreBlankLines ? rows.filter((row) => !(row.kind === 'same' && row.text.trim() === '')) : rows
  const added = kept.filter((row) => row.kind === 'added').length
  const removed = kept.filter((row) => row.kind === 'removed').length
  return {
    ok: true,
    rows: kept,
    added,
    removed,
    same: kept.filter((row) => row.kind === 'same').length,
    identical: added === 0 && removed === 0
  }
}

/**
 * Renders the rows as a unified patch. Only the changed hunks get context lines,
 * because a patch that repeats the whole file is not something anybody can read.
 */
export function toUnifiedPatch(result: Extract<DiffResult, { ok: true }>, context = 3): string {
  const { rows } = result
  const interesting = rows.map((row) => row.kind !== 'same')
  const keep = rows.map((_, index) => {
    if (interesting[index]) return true
    for (let offset = -context; offset <= context; offset += 1) {
      if (interesting[index + offset]) return true
    }
    return false
  })

  const out: string[] = []
  let index = 0
  while (index < rows.length) {
    if (!keep[index]) {
      index += 1
      continue
    }
    const start = index
    while (index < rows.length && keep[index]) index += 1
    const hunk = rows.slice(start, index)
    const leftStart = hunk.find((row) => row.left !== null)?.left ?? 0
    const rightStart = hunk.find((row) => row.right !== null)?.right ?? 0
    const leftCount = hunk.filter((row) => row.left !== null).length
    const rightCount = hunk.filter((row) => row.right !== null).length
    out.push(`@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`)
    for (const row of hunk) {
      const marker = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '
      out.push(`${marker}${row.text}`)
    }
  }
  return out.join('\n')
}

/** Drops rows that carry nothing but context, which is what the render list wants. */
export function changedRows(rows: DiffRow[], context = 1): DiffRow[] {
  const interesting = rows.map((row) => row.kind !== 'same')
  return rows.filter((_, index) => {
    if (interesting[index]) return true
    for (let offset = -context; offset <= context; offset += 1) {
      if (interesting[index + offset]) return true
    }
    return false
  })
}