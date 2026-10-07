/**
 * The regular expression tester.
 *
 * The browser can do the matching; what is worth writing down here is the part
 * that is easy to get wrong. A pattern that matches the empty string would spin
 * forever under `/g`, because `lastIndex` never moves, so every empty match has
 * to advance it by hand. And the group table has to be stable across matches:
 * an optional group that did not participate is `undefined` in one match and a
 * string in the next, which is reported as an empty cell rather than as a
 * different column count.
 */

export type RegexErrorCode = 'empty' | 'invalid'

export type RegexMatch = {
  index: number
  end: number
  text: string
  /** One entry per capture group, in order, with `name` set for named groups. */
  groups: { name: string | null; value: string }[]
}

export type RegexResult =
  | {
      ok: true
      matches: RegexMatch[]
      matchCount: number
      groupCount: number
      /** One entry per capture group, so the table has its columns before any match. */
      groupNames: (string | null)[]
      flags: string[]
      duration: number
    }
  | { ok: false; code: RegexErrorCode; message?: string }

/** Flags the page offers, each of which changes what the pattern means. */
export const regexFlagIds = ['g', 'i', 'm', 's', 'u'] as const
export type RegexFlag = (typeof regexFlagIds)[number]

/**
 * Walks the pattern once and returns one entry per capture group: its name when it
 * has one, `null` when it does not.
 *
 * The positions have to line up with what the engine reports, so a plain `(` and a
 * `(?<name>` both consume a slot and only the second carries a name. Character
 * classes and escapes are stepped over, since neither can open a group.
 */
export function groupLayout(pattern: string): (string | null)[] {
  const names: (string | null)[] = []
  let index = 0
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '[') {
      const close = pattern.indexOf(']', index + 1)
      index = close === -1 ? pattern.length : close + 1
      continue
    }
    if (char !== '(') {
      index += 1
      continue
    }
    const named = /^\(\?P?<([A-Za-z_]\w*)>/.exec(pattern.slice(index))
    if (named) {
      names.push(named[1])
      index += named[0].length
      continue
    }
    // `(?:` `(?=` `(?!` `(?<=` `(?<!` open groups that do not capture.
    if (pattern.startsWith('(?', index) && !pattern.startsWith('(?<', index)) {
      index += 2
      continue
    }
    names.push(null)
    index += 1
  }
  return names
}

/** The names alone, which is what a caller with no matches yet needs. */
export function groupNamesOf(pattern: string): (string | null)[] {
  return groupLayout(pattern)
}

export function testPattern(subject: string, pattern: string, flags: string[] = ['g']): RegexResult {
  if (!pattern) return { ok: false, code: 'empty' }
  // `y` and `d` are not offered, and duplicates would throw, so they are dropped
  // rather than letting a stale flag combination break the page.
  const clean = [...new Set(flags.filter((flag) => regexFlagIds.includes(flag as RegexFlag)))]
  const started = Date.now()
  let expression: RegExp
  try {
    expression = new RegExp(pattern, clean.join(''))
  } catch (error) {
    return { ok: false, code: 'invalid', message: error instanceof Error ? error.message : String(error) }
  }

  const matches: RegexMatch[] = []
  const global = clean.includes('g')
  // Computed from the pattern rather than from the first match, so a pattern with
  // no match yet still gets its columns, and so named groups keep their position
  // when an unnamed group comes first.
  const names = groupLayout(pattern)
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = global ? expression.exec(subject) : (expression.exec(subject) as RegExpExecArray | null)) !== null) {
    const groups: { name: string | null; value: string }[] = []
    for (let index = 1; index < match.length; index += 1) {
      // A group that did not participate comes back as `undefined`; showing an
      // empty cell keeps the column count the same from one match to the next.
      groups.push({ name: names[index - 1] ?? null, value: match[index] ?? '' })
    }
    matches.push({ index: match.index, end: match.index + match[0].length, text: match[0], groups })
    if (!global) break
    if (match[0] === '') expression.lastIndex += 1
    guard += 1
    // A pathological pattern on a long input must not hang the tab.
    if (guard > 10_000) break
  }

  const groupCount = Math.max(names.length, ...matches.map((entry) => entry.groups.length), 0)
  return {
    ok: true,
    matches,
    matchCount: matches.length,
    groupCount,
    groupNames: names,
    flags: clean,
    duration: Date.now() - started
  }
}

export type ReplaceResult =
  | { ok: true; output: string; replaced: number }
  | { ok: false; code: RegexErrorCode; message?: string }

/**
 * Expands `$1` and `$<name>` the way the engine would.
 *
 * `String.replace` cannot be handed a plain string here, because counting the
 * replacements needs a callback, and a callback receives the substitution raw. So
 * the four special forms are handled here: `$$` for a literal dollar, `$&` for
 * the whole match, `` $` `` and `$'` for the text around it.
 */
type ReplacementContext = {
  /** The whole match at 0, then one entry per capture group. */
  captures: (string | undefined)[]
  input: string | undefined
  tail: string | undefined
}

function expandReplacement(replacement: string, context: ReplacementContext, named: Record<string, string | undefined>) {
  const captures = context.captures
  let out = ''
  for (let index = 0; index < replacement.length; index += 1) {
    const char = replacement[index]
    if (char !== '$' || index === replacement.length - 1) {
      out += char
      continue
    }
    const next = replacement[index + 1]
    if (next === '$') {
      out += '$'
      index += 1
      continue
    }
    if (next === '&') {
      out += captures[0] ?? ''
      index += 1
      continue
    }
    if (next === '`') {
      out += context.input ?? ''
      index += 1
      continue
    }
    if (next === "'") {
      out += context.tail ?? ''
      index += 1
      continue
    }
    if (next === '<') {
      const close = replacement.indexOf('>', index + 2)
      const name = close === -1 ? '' : replacement.slice(index + 2, close)
      out += named[name] ?? ''
      index = close === -1 ? replacement.length : close
      continue
    }
    const digits = /^\d{1,2}/.exec(replacement.slice(index + 1))?.[0]
    if (digits) {
      const slot = Number(digits)
      // `$12` on a pattern with fewer groups means group 12, not group 1 then 2,
      // which is the rule the engine uses.
      out += slot < captures.length ? (captures[slot] ?? '') : (captures[1] ?? '')
      index += digits.length
      continue
    }
    out += char
  }
  return out
}

/**
 * Applies a replacement across the subject. `$1` and `$<name>` are expanded by
 * {@link expandReplacement}; what this adds is the count, and a pattern that would
 * loop is refused rather than left to hang the tab.
 */
export function replaceAll(subject: string, pattern: string, replacement: string, flags: string[] = ['g']): ReplaceResult {
  if (!pattern) return { ok: false, code: 'empty' }
  const clean = [...new Set(flags.filter((flag) => regexFlagIds.includes(flag as RegexFlag)))]
  try {
    const expression = new RegExp(pattern, clean.join(''))
    let replaced = 0
    const output = subject.replace(expression, (...args: unknown[]) => {
      replaced += 1
      // The engine appends the offset, the whole subject and, only when the
      // pattern has named groups, an object of them. Which of those is present is
      // what tells the tail apart from the last capture group.
      const last = args.at(-1)
      const hasNamed = typeof last === 'object' && last !== null
      const cut = hasNamed ? 3 : 2
      const captures = args.slice(0, -cut) as (string | undefined)[]
      const [offset, input] = args.slice(-cut, hasNamed ? -1 : undefined) as [number, string]
      const whole = String(args[0] ?? '')
      const named = (hasNamed ? last : {}) as Record<string, string | undefined>
      return expandReplacement(replacement, { captures, input, tail: input.slice(offset + whole.length) }, named)
    })
    return { ok: true, output, replaced }
  } catch (error) {
    return { ok: false, code: 'invalid', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Every flag combination that changes what the pattern means, for the legend. */
export const regexFlagHints: Record<RegexFlag, string> = {
  g: 'global',
  i: 'ignoreCase',
  m: 'multiline',
  s: 'dotAll',
  u: 'unicode'
}