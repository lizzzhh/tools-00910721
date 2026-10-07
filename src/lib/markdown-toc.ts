/**
 * Heading extraction for the table of contents tool.
 *
 * The hard part is not finding `#`, it is not finding one inside a fenced code
 * block, which is why the fence state is tracked across the whole document
 * instead of per line. The second half is anchors: GitHub's slugger keeps a
 * counter per slug and appends `-1`, `-2` for the repeats, because that is the
 * behaviour the reader's links will already assume.
 */

export type Heading = {
  level: number
  text: string
  slug: string
  line: number
}

export type TocOptions = {
  minLevel?: number
  maxLevel?: number
  numbered?: boolean
  /** Indentation added per level, so a nested list renders as a nested list. */
  indent?: string
  linkStyle?: 'anchor' | 'plain'
}

export type TocResult = {
  ok: true
  headings: Heading[]
  /** The table of contents, one line per heading, ready to paste. */
  lines: string[]
  duplicates: number
  highest: number
}

const fencePattern = /^\s{0,3}(`{3,}|~{3,})/
const atxPattern = /^(\s{0,3})(#{1,6})(\s+(.*?))?\s*$/
const fenceInfoPattern = /^\s{0,3}(`{3,}|~{3,})(.*)$/

/** Drops the inline markup so a heading reads as its words, not its source. */
export function plainHeading(source: string) {
  return source
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** GitHub's rule: lower case, spaces to dashes, drop everything else, dedupe. */
export function slugify(text: string, seen: Map<string, number> = new Map()): string {
  const base =
    plainHeading(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      // Punctuation that was dropped leaves the dashes around it touching, so the
      // runs collapse here rather than producing `hello----world`.
      .replace(/\s*-\s*/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/\s+/g, '-') || 'section'
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

export function buildToc(markdown: string, options: TocOptions = {}): TocResult {
  const minLevel = Math.min(6, Math.max(1, options.minLevel ?? 1))
  const maxLevel = Math.min(6, Math.max(minLevel, options.maxLevel ?? 6))
  const indent = options.indent ?? '  '
  const linkStyle = options.linkStyle ?? 'anchor'

  const seen = new Map<string, number>()
  const headings: Heading[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let fence: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    // Setext headings are the underlined form: `Title` then `=====`. The very first
    // line of a document underlined by `---` is front matter, not a heading, which
    // is the one case where the two readings collide.
    const underlined = /^\s{0,3}(=+|-+)\s*$/.exec(line) ? index + 1 : -1
    const fenceMatch = fenceInfoPattern.exec(line)
    if (fence) {
      // A closing fence is the same character, at least as long, and nothing else.
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      continue
    }

    if (underlined !== -1) {
      const previous = lines[index - 1]
      const usable =
        index > 0 &&
        previous !== undefined &&
        previous.trim() !== '' &&
        !atxPattern.test(previous) &&
        !fencePattern.test(previous) &&
        /^[\s>]*(?:[-*+]\s|\d+[.)]\s)/.test(previous) === false &&
        !(index === 2 && lines[0].trim() === '---')
      if (usable) {
        const level = line.trim().startsWith('=') ? 1 : 2
        if (level >= minLevel && level <= maxLevel) {
          headings.push({ level, text: plainHeading(previous.trim()), slug: slugify(previous, seen), line: index })
        }
      }
      continue
    }

    const atx = atxPattern.exec(line)
    if (!atx) continue
    const level = atx[2].length
    const text = (atx[4] ?? '').replace(/\s+#+\s*$/, '')
    if (!text.trim()) continue
    if (level < minLevel || level > maxLevel) continue
    headings.push({ level, text: plainHeading(text), slug: slugify(text, seen), line: index + 1 })
  }

  const numbers: number[] = []
  const rendered = headings.map((heading) => {
    while (numbers.length > heading.level - 1) numbers.pop()
    if (numbers.length === heading.level - 1) numbers.push(1)
    else numbers[heading.level - 1] += 1
    for (let level = numbers.length; level < heading.level; level += 1) numbers[level] = 0
    const label = options.numbered ? `${numbers.slice(0, heading.level).filter((part) => part > 0).join('.')}. ${heading.text}` : heading.text
    const prefix = indent.repeat(heading.level - minLevel)
    return linkStyle === 'anchor' ? `${prefix}- [${label}](#${heading.slug})` : `${prefix}- ${label}`
  })

  return {
    ok: true,
    headings,
    lines: rendered,
    duplicates: [...seen.values()].filter((count) => count > 1).length,
    highest: headings.reduce((highest, heading) => Math.max(highest, heading.level), 0)
  }
}

/** Injecting the contents under a title, which is what most documents want. */
export function insertToc(markdown: string, toc: TocResult, afterHeadings = 1): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let index = 0
  let counted = 0
  while (index < lines.length && counted < afterHeadings) {
    if (!fencePattern.test(lines[index]) && atxPattern.test(lines[index])) counted += 1
    index += 1
  }
  // A blank line on both sides: without one the list binds to the title above it
  // and Markdown reads the whole thing as one paragraph.
  const block = ['', ...toc.lines, '']
  lines.splice(index, 0, ...block)
  return lines.join('\n')
}