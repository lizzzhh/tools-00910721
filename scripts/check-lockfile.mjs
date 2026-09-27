#!/usr/bin/env node
/**
 * Checks that pnpm-lock.yaml still describes package.json.
 *
 * Cloudflare Pages detects the lockfile and installs with `--frozen-lockfile`,
 * which refuses to run when the two disagree. Nothing else in the build notices:
 * the dependency is already in node_modules locally, so every check passes and
 * every page builds, and the failure only appears as a deploy that will not start.
 * That is exactly how a dependency added to package.json without regenerating the
 * lockfile reaches production.
 *
 * Only the root importer is read, and only the fields compared here. That is a
 * deliberately narrow scan of the lockfile rather than a general YAML parse: the
 * structure it walks is a fixed four levels of indentation, and pulling in a
 * parser to read it would add a dependency, which is the very thing this checks.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))

const wanted = { ...pkg.dependencies, ...pkg.devDependencies }
const lock = readFileSync(`${root}pnpm-lock.yaml`, 'utf8')

// The root importer is everything between `importers:` and the next top-level key.
const importers = lock.slice(lock.indexOf('\nimporters:'), lock.indexOf('\npackages:'))
const recorded = {}
let name = ''
for (const line of importers.split('\n')) {
  // Six spaces indent a package name; eight indent one of its fields.
  const entry = /^ {6}'?([^':]+)'?:\s*$/.exec(line)
  if (entry) {
    name = entry[1]
    continue
  }
  const specifier = /^ {8}specifier:\s*(\S+)/.exec(line)
  if (specifier && name) recorded[name] = specifier[1].replace(/^['"]|['"]$/g, '')
}

const mismatched = Object.entries(wanted).filter(([key, value]) => recorded[key] !== value)
const stale = Object.keys(recorded).filter((key) => !(key in wanted))

if (mismatched.length === 0 && stale.length === 0) {
  console.log(`lockfile in sync with package.json (${Object.keys(wanted).length} dependencies)`)
} else {
  for (const [key, value] of mismatched) {
    console.error(`${key}: package.json wants ${value}, lockfile has ${recorded[key] ?? 'nothing'}`)
  }
  for (const key of stale) console.error(`${key}: in the lockfile but not in package.json`)
  console.error('\nlockfile is out of date; run: pnpm install --lockfile-only')
  process.exit(1)
}
