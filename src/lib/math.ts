import katex from 'katex'

/**
 * TeX rendering for the few places that need real maths.
 *
 * The project renders formulas with KaTeX rather than Unicode super/subscript
 * characters, because those glyphs fall back to whatever font the system has
 * and render inconsistently across platforms. KaTeX also buys real fractions
 * and operator names, which plain `<sup>` markup cannot express.
 *
 * Two entry points matter:
 *
 * - {@link renderMathInText} runs at build time, for prose that mixes words and
 *   formulas. Text outside `$...$` is HTML-escaped, so a value interpolated
 *   into a translated string can never inject markup.
 * - {@link renderMathInto} runs in the browser, for numbers that change while
 *   the page is open.
 */
const KATEX_OPTIONS: katex.KatexOptions = {
  displayMode: false,
  throwOnError: true,
  // Keeps a MathML copy in the output so screen readers get the formula
  // instead of reading the layout markup character by character.
  output: 'htmlAndMathml',
  strict: false
}

/** Escapes the five characters that matter inside element content. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Renders a bare TeX string, with no `$` delimiters, as HTML.
 *
 * Used for values that are entirely mathematical, such as a percentage that
 * fell out of scientific notation.
 */
export function renderMath(tex: string): string {
  return katex.renderToString(tex, KATEX_OPTIONS)
}

/**
 * Renders prose containing `$...$` math spans into HTML.
 *
 * Only text authored in this repository reaches this function, and the
 * non-math segments are escaped, so the result is safe to hand to `set:html`.
 *
 * An unpaired `$` is left as literal text instead of being treated as a math
 * span, which keeps a half-written translation, or a price like `$5`, from
 * either throwing or silently losing its currency symbol.
 */
export function renderMathInText(text: string): string {
  const parts = text.split('$')
  // An even number of delimiters gives an odd number of segments: prose, math,
  // prose, ... Anything else is malformed and is escaped whole.
  if (parts.length % 2 === 0) return escapeHtml(text)
  if (parts.length === 1) return escapeHtml(text)
  return parts
    .map((part, index) => (index % 2 === 1 && part.length > 0 ? renderMath(part) : escapeHtml(part)))
    .join('')
}

/** Replaces the contents of `host` with `tex` rendered by KaTeX. */
export function renderMathInto(host: HTMLElement, tex: string): void {
  katex.render(tex, host, KATEX_OPTIONS)
}
