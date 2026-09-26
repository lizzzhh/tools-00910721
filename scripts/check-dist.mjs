#!/usr/bin/env node
/**
 * Post-build gate: every internal link must resolve to a real file, and no
 * localized page may leak Simplified characters.
 *
 * The first check exists because a route param can silently disagree with the
 * locale prefix (e.g. building dist/zh-TW while linking to /zh-tw/), which
 * 404s on any case-sensitive host.
 *
 *   node scripts/check-dist.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first')
  process.exitCode = 1
} else {
  const problems = []

  // 1. internal links resolve
  const pages = globSync('**/*.html', { cwd: DIST })
  let linkCount = 0
  for (const page of pages) {
    const html = readFileSync(join(DIST, page), 'utf8')
    for (const href of new Set(html.match(/href="(\/[^"#?]*)"/g) ?? [])) {
      const path = href.slice(6, -1)
      if (path.startsWith('/_astro') || path === '/favicon.svg') continue
      const target = join(DIST, path)
      // directory-style URLs must have an index.html; other paths must exist as files
      const ok = path.endsWith('/') ? existsSync(join(target, 'index.html')) : existsSync(target)
      linkCount += 1
      if (!ok) problems.push(`broken link ${path} in ${page}`)
    }
  }
  console.log(`internal links: ${linkCount} checked across ${pages.length} pages`)

  // 2. no Simplified leakage in the Traditional Chinese build
  const simpSource = readFileSync(join(ROOT, 'scripts/check-dictionaries.mjs'), 'utf8')
  const simplifiedOnly = new Set(simpSource.match(/const simplifiedOnly = `([^`]*)`/)[1])
  // language endonyms are intentionally written in each language's own script
  const endonyms = new Set([...'简体中文繁體中文'])
  for (const page of pages) {
    if (!page.startsWith('zh-tw/')) continue
    const body = readFileSync(join(DIST, page), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')
    const text = body.replace(/<[^>]+>/g, ' ')
    const leaked = [...new Set([...text].filter((ch) => simplifiedOnly.has(ch) && !endonyms.has(ch)))]
    if (leaked.length) problems.push(`zh-tw/${page.slice(6)} leaks Simplified: ${leaked.join('')}`)
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems.slice(0, 40)) console.error(`  ${p}`)
    process.exitCode = 1
  } else {
    console.log('all internal links resolve; no Simplified leakage in zh-tw')
  }
}
