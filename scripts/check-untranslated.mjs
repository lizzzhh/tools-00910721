#!/usr/bin/env node
/**
 * Scans src/ for user-facing CJK strings that are not yet routed through the
 * dictionaries. Exits non-zero while any remain, so it doubles as a
 * completeness gate in CI.
 *
 *   node scripts/check-untranslated.mjs          # summary + first offenders
 *   node scripts/check-untranslated.mjs --all    # every hit
 *   node scripts/check-untranslated.mjs --json   # machine readable
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const DICT_DIR = join(SRC, 'i18n/locales')

/** Files that are allowed to contain CJK: the dictionaries themselves. */
const ALLOWED = new Set([join(DICT_DIR, 'zh-CN.ts'), join(DICT_DIR, 'zh-TW.ts'), join(DICT_DIR, 'ja.ts')])

/**
 * Lines whose CJK is legitimate even outside a dictionary:
 * regexes, code fences, generated icon names, and glossary/keyword data.
 */
const SKIP_PATTERNS = [
  /^\s*(?:\/\/|\*|\/\*)/, // comments
  /^\s*(?:`{3,}|~{3,})/, // markdown fences
  /https?:\/\//, // urls
  /^\s*$/, // blank
  /keywords:/, // multilingual search index
  // Registry entries inline multilingual search keywords on one line; those are
  // data, not UI copy, so CJK there is expected in every locale.
  /^\s*(?:plannedTool|previewTool|tool)\(/,
  // Conversion samples for the fullwidth/halfwidth tool intentionally mix
  // scripts, so CJK in the English dictionary is correct on these keys.
  /placeholderTo(?:Half|Full):/,
  // Locale endonyms in the language switcher. Each locale is deliberately named
  // in its own language, so these must stay literal CJK in every build.
  /^\s*'?\s*(?:'zh-CN'|'zh-TW'|ja)\s*'?:\s*\{\s*label:/,
  // BIP39 wordlist endonyms. A wordlist is named in its own script, so
  // "简体中文" must stay literal rather than being routed through the
  // dictionaries, which would show the wrong name for the language selected.
  /^\s*'chinese-(?:simplified|traditional)':\s*'/,
  /^\s*japanese:\s*'/,
  // The official BIP39 wordlists themselves. These files are verbatim upstream
  // data: the index of a word is what encodes entropy, so they cannot be
  // translated and the CJK in them is the payload rather than UI copy.
  /^const WORDS = '/,
]

const CJK = /[\u4e00-\u9fff\u3005\u3007]/
const CJK_G = /[\u4e00-\u9fff\u3005\u3007]+/g

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (['.astro', '.ts', '.tsx'].includes(extname(full))) out.push(full)
  }
  return out
}

/** Collect string literals and text nodes that contain CJK on a given line. */
function hitsIn(line) {
  const hits = []
  // quoted literals
  for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (CJK.test(m[2])) hits.push(m[2])
  }
  // bare text between tags: >文本<
  for (const m of line.matchAll(/>([^<>{}]*[一-鿿][^<>{}]*)</g)) {
    if (m[1].trim()) hits.push(m[1].trim())
  }
  // Astro expressions like {cond ? '中文' : 'x'} already covered by quoted scan
  return hits.filter((h) => h.length > 0 && !/^\s*$/.test(h))
}

const files = walk(SRC).filter((f) => !ALLOWED.has(f))
const findings = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (!CJK.test(line)) return
    if (SKIP_PATTERNS.some((p) => p.test(line))) return
    for (const text of hitsIn(line)) {
      findings.push({ file: relative(ROOT, file), line: index + 1, text })
    }
  })
}

const byFile = new Map()
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, [])
  byFile.get(f.file).push(f)
}

const total = findings.length
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total, byFile: Object.fromEntries(byFile) }, null, 2))
} else if (total === 0) {
  console.log('no untranslated CJK strings in src/')
} else {
  console.log(`${total} untranslated string(s) in ${byFile.size} file(s)\n`)
  const showAll = process.argv.includes('--all')
  for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(items.length).padStart(3)}  ${file}`)
    for (const item of items.slice(0, showAll ? undefined : 3)) {
      console.log(`       ${item.line}: ${item.text.replace(/\s+/g, ' ').slice(0, 90)}`)
    }
    if (!showAll && items.length > 3) console.log(`       ... ${items.length - 3} more`)
  }
}
process.exitCode = total ? 1 : 0
