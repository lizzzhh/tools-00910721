export type EntityMode = 'basic' | 'named' | 'all'

export type EntityFormat = 'named' | 'decimal' | 'hex'

/** Codes the UI maps to `toolUi.html-entity.errors.*`. */
export type HtmlErrorCode = 'invalidCodePoint' | 'invalidSurrogate' | 'unknownEntity'

export type HtmlErrorParams = { raw: string }

export type HtmlResult =
  | {
      ok: true
      output: string
      replaced: number
      inputLength: number
      outputLength: number
    }
  | {
      ok: false
      code: HtmlErrorCode
      params?: HtmlErrorParams
      position?: number
    }

const basicEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '`': '&#96;'
}

const namedEntities: Record<string, string> = {
  '\u00A0': '&nbsp;',
  '¡': '&iexcl;',
  '¢': '&cent;',
  '£': '&pound;',
  '¤': '&curren;',
  '¥': '&yen;',
  '¦': '&brvbar;',
  '§': '&sect;',
  '¨': '&uml;',
  '©': '&copy;',
  'ª': '&ordf;',
  '«': '&laquo;',
  '¬': '&not;',
  '\u00AD': '&shy;',
  '®': '&reg;',
  '¯': '&macr;',
  '°': '&deg;',
  '±': '&plusmn;',
  '²': '&sup2;',
  '³': '&sup3;',
  '´': '&acute;',
  'µ': '&micro;',
  '¶': '&para;',
  '·': '&middot;',
  '¸': '&cedil;',
  '¹': '&sup1;',
  'º': '&ordm;',
  '»': '&raquo;',
  '¼': '&frac14;',
  '½': '&frac12;',
  '¾': '&frac34;',
  '¿': '&iquest;',
  'À': '&Agrave;',
  'Á': '&Aacute;',
  'Â': '&Acirc;',
  'Ã': '&Atilde;',
  'Ä': '&Auml;',
  'Å': '&Aring;',
  'Æ': '&AElig;',
  'Ç': '&Ccedil;',
  'È': '&Egrave;',
  'É': '&Eacute;',
  'Ê': '&Ecirc;',
  'Ë': '&Euml;',
  'Ì': '&Igrave;',
  'Í': '&Iacute;',
  'Î': '&Icirc;',
  'Ï': '&Iuml;',
  'Ð': '&ETH;',
  'Ñ': '&Ntilde;',
  'Ò': '&Ograve;',
  'Ó': '&Oacute;',
  'Ô': '&Ocirc;',
  'Õ': '&Otilde;',
  'Ö': '&Ouml;',
  '×': '&times;',
  'Ø': '&Oslash;',
  'Ù': '&Ugrave;',
  'Ú': '&Uacute;',
  'Û': '&Ucirc;',
  'Ü': '&Uuml;',
  'Ý': '&Yacute;',
  'Þ': '&THORN;',
  'ß': '&szlig;',
  'à': '&agrave;',
  'á': '&aacute;',
  'â': '&acirc;',
  'ã': '&atilde;',
  'ä': '&auml;',
  'å': '&aring;',
  'æ': '&aelig;',
  'ç': '&ccedil;',
  'è': '&egrave;',
  'é': '&eacute;',
  'ê': '&ecirc;',
  'ë': '&euml;',
  'ì': '&igrave;',
  'í': '&iacute;',
  'î': '&icirc;',
  'ï': '&iuml;',
  'ð': '&eth;',
  'ñ': '&ntilde;',
  'ò': '&ograve;',
  'ó': '&oacute;',
  'ô': '&ocirc;',
  'õ': '&otilde;',
  'ö': '&ouml;',
  '÷': '&divide;',
  'ø': '&oslash;',
  'ù': '&ugrave;',
  'ú': '&uacute;',
  'û': '&ucirc;',
  'ü': '&uuml;',
  'ý': '&yacute;',
  'þ': '&thorn;',
  'ÿ': '&yuml;',
  '…': '&hellip;',
  '‰': '&permil;',
  '‹': '&lsaquo;',
  '›': '&rsaquo;',
  '€': '&euro;',
  '™': '&trade;',
  '←': '&larr;',
  '↑': '&uarr;',
  '→': '&rarr;',
  '↓': '&darr;',
  '↔': '&harr;',
  '↕': '&varr;',
  '∅': '&empty;',
  '∀': '&forall;',
  '∂': '&part;',
  '∃': '&exist;',
  '∆': '&Delta;',
  '∇': '&nabla;',
  '∈': '&isin;',
  '∉': '&notin;',
  '∏': '&prod;',
  '∑': '&sum;',
  '−': '&minus;',
  '√': '&radic;',
  '∞': '&infin;',
  '∠': '&ang;',
  '∧': '&and;',
  '∨': '&or;',
  '∩': '&cap;',
  '∪': '&cup;',
  '∫': '&int;',
  '∴': '&there4;',
  '≈': '&asymp;',
  '≠': '&ne;',
  '≡': '&equiv;',
  '≤': '&le;',
  '≥': '&ge;',
  '⊂': '&sub;',
  '⊃': '&sup;',
  '⊆': '&sube;',
  '⊇': '&supe;',
  '⊕': '&oplus;',
  '⊗': '&otimes;',
  '⋅': '&sdot;',
  '′': '&prime;',
  '″': '&Prime;',
  '⁄': '&frasl;',
  '⁰': '&sup0;',
  '⁴': '&sup4;',
  '⁵': '&sup5;',
  '⁶': '&sup6;',
  '⁷': '&sup7;',
  '⁸': '&sup8;',
  '⁹': '&sup9;',
  '₀': '&sub0;',
  '₁': '&sub1;',
  '₂': '&sub2;',
  '₃': '&sub3;',
  '₄': '&sub4;',
  '₅': '&sub5;',
  '₆': '&sub6;',
  '₇': '&sub7;',
  '₈': '&sub8;',
  '₉': '&sub9;',
  '♀': '&female;',
  '♂': '&male;',
  '♠': '&spades;',
  '♣': '&clubs;',
  '♥': '&hearts;',
  '♦': '&diams;',
  '♩': '&music;',
  '⇐': '&lArr;',
  '⇑': '&uArr;',
  '⇒': '&rArr;',
  '⇓': '&dArr;',
  '⇔': '&hArr;',
  '⌈': '&lceil;',
  '⌉': '&rceil;',
  '⌊': '&lfloor;',
  '⌋': '&rfloor;',
  '〈': '&lang;',
  '〉': '&rang;',
  '■': '&squ;',
  '□': '&square;',
  '▪': '&squf;',
  '▲': '&utrif;',
  '▼': '&dtrif;',
  '△': '&utri;',
  '▽': '&dtri;',
  '○': '&circ;',
  '●': '&bull;',
  '☐': '&boxh;',
  '☑': '&check;',
  '☒': '&cross;'
}

function formatCodePoint(codePoint: number, format: EntityFormat) {
  if (format === 'hex') return `&#x${codePoint.toString(16).toUpperCase()};`
  return `&#${codePoint};`
}

export function encodeHtml(input: string, mode: EntityMode = 'basic', format: EntityFormat = 'named'): HtmlResult {
  let output = ''
  let replaced = 0

  for (const character of input) {
    const codePoint = character.codePointAt(0) ?? 0
    const basic = basicEntities[character]
    const named = namedEntities[character]

    if (basic) {
      output += basic
      replaced += 1
      continue
    }

    if (mode === 'basic') {
      output += character
      continue
    }

    if (mode === 'named' && named && format === 'named') {
      output += named
      replaced += 1
      continue
    }

    if (mode === 'all' && codePoint > 0x7f) {
      output += formatCodePoint(codePoint, format)
      replaced += 1
      continue
    }

    if (mode === 'named' && named) {
      output += formatCodePoint(codePoint, format)
      replaced += 1
      continue
    }

    output += character
  }

  return { ok: true, output, replaced, inputLength: input.length, outputLength: output.length }
}

const entityLookup = new Map<string, string>()

for (const table of [basicEntities, namedEntities]) {
  for (const [character, entity] of Object.entries(table)) {
    if (!entityLookup.has(entity)) entityLookup.set(entity, character)
  }
}

const entityPatternSource = '&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);'

export function decodeHtml(input: string, lenient = false): HtmlResult {
  const pattern = new RegExp(entityPatternSource, 'g')
  let output = ''
  let replaced = 0
  let cursor = 0
  let searchFrom = 0

  while (searchFrom < input.length) {
    const ampersand = input.indexOf('&', searchFrom)
    if (ampersand < 0) break

    pattern.lastIndex = ampersand
    const match = pattern.exec(input)
    if (!match || match.index !== ampersand) {
      searchFrom = ampersand + 1
      continue
    }

    const entity = match[0]
    const body = match[1]
    let character: string | undefined

    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) {
        return { ok: false, code: 'invalidCodePoint', params: { raw: body }, position: ampersand + 1 }
      }
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return { ok: false, code: 'invalidSurrogate', params: { raw: body }, position: ampersand + 1 }
      }
      character = String.fromCodePoint(codePoint)
    } else {
      character = entityLookup.get(entity)
    }

    if (character === undefined) {
      if (lenient) {
        searchFrom = ampersand + 1
        continue
      }
      return { ok: false, code: 'unknownEntity', params: { raw: entity }, position: ampersand + 1 }
    }

    output += input.slice(cursor, ampersand) + character
    cursor = ampersand + entity.length
    searchFrom = cursor
  }

  output += input.slice(cursor)

  return { ok: true, output, replaced, inputLength: input.length, outputLength: output.length }
}
