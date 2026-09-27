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

// ------------------------------------------------------------ mnemonic overlay

test('every colour-mix colour slot is a real colour', () => {
  // A `color-mix()` slot takes `<color>` optionally followed by `<percentage>`.
  // Writing a bare `0.65 0.18 25 16%` reads as an oklch colour whose alpha is
  // 16% — but with no `oklch()` wrapper it is not a colour at all, and no
  // percentage is attached, so the declaration is invalid and the browser drops
  // it *silently*. Nothing warns: the rule simply loses that property.
  //
  // That is not hypothetical. Four declarations were written that way, and the
  // two in `.security-error` had been rendering the BIP39 error message with no
  // background and no border for however long they had been there. The tell is
  // only visible in a real browser — `getComputedStyle` returns the user-agent
  // value, as it returned `mark` yellow for the misspelled-word highlight.
  const css = readFileSync('src/styles/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const offenders = []
  // `L C H P%` with no wrapper: four numbers in a row, the last a percentage,
  // where a `<color>` should be. Named colours, `var()`, `#hex` and real
  // `oklch(...)` calls are all fine and must not match.
  const BARE_FOUR_PART = /(?:^|[,(]\s*)(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)%/
  for (const mix of css.matchAll(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g)) {
    const body = mix[0]
    // Everything up to the first top-level comma is the colour space.
    const slots = body.slice(body.indexOf('(') + 1, -1)
    for (const slot of slots.split(',')) {
      const trimmed = slot.trim()
      if (BARE_FOUR_PART.test(trimmed)) offenders.push(`${mix[0]}  <- slot "${trimmed}"`)
    }
  }
  assert.deepEqual(offenders, [], `wrap the alpha in the colour function:\n${offenders.join('\n')}`)
})

test('the misspelled-word mark cannot shift the text it sits in', () => {
  // The BIP39 field paints its red marks on a transparent layer *behind* a
  // textarea, and the two have to lay text out identically. So the mark that
  // wraps a misspelled word may only carry paint properties: any padding,
  // border, margin or font change would push every following character sideways
  // and the mark would drift off the word it belongs to. `background`,
  // `box-shadow` and `border-radius` all leave the line box untouched.
  const css = readFileSync('src/styles/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const block = css.split('}').find((part) => part.split('{')[0].includes('.bip39-word-bad'))
  assert.ok(block, 'the .bip39-word-bad rule is gone, so nothing marks a typo')
  const declarations = block.slice(block.indexOf('{') + 1)
  for (const line of declarations.split(';')) {
    const property = line.split(':')[0]?.trim()
    if (!property) continue
    assert.ok(
      /^(background|background-color|box-shadow|border-radius|color|opacity|text-decoration|text-underline-offset)$/.test(property),
      `.bip39-word-bad must not set \`${property}\` — it would desynchronise the overlay from the textarea`
    )
  }
  // `color` is not optional: the user-agent style for <mark> is black on yellow,
  // which is unreadable in the dark theme.
  assert.match(declarations, /color\s*:\s*inherit/)
})

test('the overlay layers and the textarea share one text box', () => {
  // Every layer has to agree on the font, the line box, the padding and the
  // wrapping, or the picture stops lining up with the text. None of that can be
  // inherited from the `textarea` element rule, because the twins are divs and
  // would never match it — so all three are named in one shared block.
  const css = readFileSync('src/styles/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const shared = css
    .split('}')
    .find((part) => ['.bip39-mnemonic', '.bip39-highlight', '.bip39-caret-ruler'].every((c) => part.split('{')[0].includes(c)))
  assert.ok(shared, 'the three layers no longer share a rule')
  const declarations = shared.slice(shared.indexOf('{') + 1)
  for (const property of [
    'box-sizing',
    'font-family',
    'font-size',
    'line-height',
    'letter-spacing',
    'padding',
    'white-space',
    'word-break',
    'overflow-wrap'
  ]) {
    assert.ok(declarations.includes(`${property}:`), `the shared box is missing \`${property}\``)
  }
})

test('the mnemonic field keeps the textarea for the text, not a token widget', () => {
  // Three of the four wordlists are CJK, so the field has to work under an IME.
  // A chip-per-word widget would tear composition apart, so the text stays in a
  // real <textarea> and the marks are drawn behind it.
  const component = readFileSync('src/components/tools/Bip39Tool.astro', 'utf8')
  const script = readFileSync('src/scripts/bip39.ts', 'utf8')
  assert.match(component, /<textarea[\s\S]*?id="bip39-input"/, 'the field is no longer a textarea')
  assert.match(component, /id="bip39-highlight"/)
  assert.match(component, /id="bip39-caret-ruler"/)
  assert.ok(!/contenteditable/.test(component), 'contenteditable cannot host an IME composition reliably')
  // The twins must stay out of the accessibility tree, or the text is announced
  // twice.
  for (const id of ['bip39-highlight', 'bip39-caret-ruler']) {
    const tag = component.slice(component.indexOf(`id="${id}"`) - 400, component.indexOf(`id="${id}"`) + 40)
    assert.match(tag, /aria-hidden="true"/, `${id} is not hidden from assistive technology`)
  }
  // Composition is tracked so neither the marks nor the popup open mid-phrase.
  assert.match(script, /compositionstart/)
  assert.match(script, /compositionend/)
  assert.match(script, /event\.isComposing/)
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
