import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { renderMath, renderMathInText } from '../src/lib/math.ts'

// --------------------------------------------------------------- typography

// Superscript and subscript digits. KaTeX renders these from the source
// exponent, so any that survive into a template are hand-typed Unicode that
// would fall back to whatever font the visitor's system happens to have.
const UNICODE_SCRIPT_DIGITS =
  /[\u00b9\u00b2\u00b3\u2070\u2074-\u2079\u2080-\u2089\u207b\u207a\u208a-\u208e]/

/** The one place these characters are legitimate: the entity decoder's own table. */
const ALLOWED = new Set(['src/lib/html-entities.ts'])

const SOURCE_DIRS = ['src', 'tests', 'scripts']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.astro', 'public'])

function sourceFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(astro|ts|tsx|js|jsx|mjs|css|md|mdx|json|html)$/.test(name)) out.push(full)
  }
  return out
}

test('no source file hand-types Unicode sub or superscript digits', () => {
  const offenders = []
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(dir)) {
      if (ALLOWED.has(file)) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (UNICODE_SCRIPT_DIGITS.test(line)) {
            offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 90)}`)
          }
        })
    }
  }
  assert.deepEqual(offenders, [], `use TeX or <sup>/<sub> instead:\n${offenders.join('\n')}`)
})

test('the entity decoder keeps its Unicode table', () => {
  // The guard above skips this file, so make the exemption explicit rather than
  // letting it rot unnoticed.
  const table = readFileSync('src/lib/html-entities.ts', 'utf8')
  assert.ok(UNICODE_SCRIPT_DIGITS.test(table), 'expected the entity table to still map them')
})

test('no CSS rule lets a bare `span` selector reach into rendered maths', () => {
  // KaTeX builds a formula out of nested <span>s, several of them absolutely
  // positioned. A descendant `span` rule on any container that holds maths
  // turns each atom into a block box and stacks one number over many lines,
  // which is exactly what `.lottery-posterior-grid span` used to do. Such a
  // selector has to be scoped with `>`.
  const CONTAINERS = ['lottery-posterior-grid', 'lottery-odds-row', 'lottery-posterior-formula', 'info-note']
  const css = readFileSync('src/styles/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  const offenders = []
  for (const block of css.split('}')) {
    const selectors = block.split('{')[0]
    if (!CONTAINERS.some((c) => selectors.includes('.' + c))) continue
    for (const selector of selectors.split(',')) {
      // Pull `>` out as its own token so a direct child is distinguishable from
      // a descendant no matter how many compounds sit in between.
      const tokens = selector.replace(/>/g, ' > ').split(/\s+/).filter(Boolean)
      for (let i = 0; i < tokens.length; i += 1) {
        if (tokens[i] !== 'span') continue
        // Directly preceded by `>` means a child selector, which is safe.
        if (tokens[i - 1] === '>') continue
        offenders.push(selector.trim().replace(/\s+/g, ' '))
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [], `scope these with ">":\n${offenders.join('\n')}`)
})

// --------------------------------------------------------------- math output

test('rendered math carries no Unicode script digits either', () => {
  // Guards the other half of the problem: TeX is fine, but a value that slipped
  // into a math string as a literal character would still render badly.
  const rendered = renderMath('2^{256}') + renderMath('3.507\\times 10^{-67}\\,\\%')
  assert.ok(!UNICODE_SCRIPT_DIGITS.test(rendered), 'KaTeX output should be pure markup')
})

test('prose around math is escaped, not trusted', () => {
  // A translated string is repository-authored, but escaping the non-math spans
  // means an interpolated value can never inject markup through set:html.
  const html = renderMathInText('a <b> & c $x^2$ <script>')
  assert.ok(html.startsWith('a &lt;b&gt; &amp; c '), html)
  assert.ok(html.endsWith(' &lt;script&gt;'), html)
  assert.ok(html.includes('katex'), 'the math span should be rendered')
})

test('an unpaired dollar sign stays literal instead of being parsed as math', () => {
  // An odd number of delimiters is malformed, so the whole string is escaped.
  // Rendering the trailing segment as maths would silently drop the `$`.
  assert.equal(renderMathInText('costs $5'), 'costs $5')
  assert.equal(renderMathInText('a $ b $ c $'), 'a $ b $ c $')
  assert.equal(renderMathInText('no math here'), 'no math here')
  // An empty math span carries no formula, so it collapses to nothing.
  assert.equal(renderMathInText('a $$ b'), 'a  b')
})

test('plain percentages render as TeX, not as bare text', () => {
  // `0\\%` rather than `0%`: in math mode a bare % would start a comment and
  // silently swallow the rest of the expression.
  assert.ok(renderMath('0\\%').includes('katex'))
  assert.ok(renderMath('16.6667\\%').includes('katex'))
})
