/**
 * Colour maths for the two colour tools: the converter reads a colour written
 * any of the usual ways and answers in every other way, and the contrast
 * checker needs the same numbers to decide whether a pair of colours is
 * readable.
 *
 * Pure and DOM-free, because the browser panel and the node tests have to agree
 * to the last decimal. Alpha is carried along but never guessed: a translucent
 * colour is only comparable once it has been laid over something, which is what
 * `composite` is for.
 */

export type ColorErrorCode = 'empty' | 'notAColor' | 'outOfRange'

export type ColorResult =
  | { ok: true; rgb: Rgb }
  | { ok: false; code: ColorErrorCode }

export type Rgb = { r: number; g: number; b: number; a: number }

export type Hsl = { h: number; s: number; l: number; a: number }

/** 0-360 hue, 0-100 saturation and lightness, as written in CSS. */
export type HslParts = { h: number; s: number; l: number }

/** OKLCH is what the stylesheet uses, so the converter speaks it too. */
export type Oklch = { l: number; c: number; h: number; a: number }

const hexPattern = /^#([0-9a-f]{3,8})$/i
const functionalPattern = /^([a-z]+)\(([^()]*)\)$/i

/** Clamps to the 0-1 range the relative luminance formula is defined on. */
function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** Rounds to the number of decimals a colour channel is ever read with. */
export function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function parseChannel(token: string, scale: number) {
  const text = token.trim()
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1))
    if (!Number.isFinite(percent)) return Number.NaN
    return (percent / 100) * scale
  }
  return Number(text)
}

/**
 * Splits the inside of `rgb(...)` or `hsl(...)`. Both forms allow the legacy
 * comma list and the modern space list with an optional `/ alpha`.
 */
function splitComponents(body: string) {
  const slash = body.split('/')
  if (slash.length > 2) return null
  const head = slash[0]
  const parts = (head.includes(',') ? head.split(',') : head.trim().split(/\s+/)).filter((part) => part.trim() !== '')
  const alphaToken = slash[1]?.trim()
  if (alphaToken === undefined) return { parts, alpha: 1 }
  const alpha = Number(alphaToken)
  if (!Number.isFinite(alpha)) return null
  return { parts, alpha: Math.min(1, Math.max(0, alpha)) }
}

function expandHex(digits: string): Rgb | null {
  const lower = digits.toLowerCase()
  const read = (index: number) => parseInt(lower[index], 16)
  if (lower.length === 3 || lower.length === 4) {
    const [r, g, b] = [0, 1, 2].map((index) => read(index) * 17)
    return { r, g, b, a: lower.length === 4 ? roundTo((read(3) * 17) / 255, 3) : 1 }
  }
  if (lower.length === 6 || lower.length === 8) {
    const byte = (index: number) => read(index) * 16 + read(index + 1)
    return { r: byte(0), g: byte(2), b: byte(4), a: lower.length === 8 ? roundTo(byte(6) / 255, 3) : 1 }
  }
  return null
}

export function toHsl(rgb: Rgb): Hsl {
  const r = clamp01(rgb.r / 255)
  const g = clamp01(rgb.g / 255)
  const b = clamp01(rgb.b / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l: lightness * 100, a: rgb.a }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === r) hue = 60 * (((g - b) / delta) % 6)
  else if (max === g) hue = 60 * ((b - r) / delta + 2)
  else hue = 60 * ((r - g) / delta + 4)
  if (hue < 0) hue += 360
  return { h: roundTo(hue, 1), s: roundTo(saturation * 100, 1), l: roundTo(lightness * 100, 1), a: rgb.a }
}

export function fromHsl(hsl: Hsl): Rgb {
  const h = ((hsl.h % 360) + 360) % 360
  const s = clamp01(hsl.s / 100)
  const l = clamp01(hsl.l / 100)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a: hsl.a
  }
}

/**
 * Reads every notation a browser accepts: hex in 3, 4, 6 and 8 digits, plus the
 * functional `rgb()`, `rgba()`, `hsl()` and `hsla()` forms in both the comma and
 * the space syntax.
 */
export function parseColor(input: string): ColorResult {
  const text = input.trim()
  if (!text) return { ok: false, code: 'empty' }

  const hex = hexPattern.exec(text)
  if (hex) {
    const rgb = expandHex(hex[1])
    if (!rgb) return { ok: false, code: 'notAColor' }
    return { ok: true, rgb }
  }

  const functional = functionalPattern.exec(text)
  if (!functional) return { ok: false, code: 'notAColor' }
  const name = functional[1].toLowerCase()
  const split = splitComponents(functional[2])
  if (!split) return { ok: false, code: 'notAColor' }
  const { parts, alpha } = split

  if (name === 'rgb' || name === 'rgba') {
    if (parts.length < 3 || parts.length > 4) return { ok: false, code: 'notAColor' }
    const channels = parts.slice(0, 3).map((part) => parseChannel(part, 255))
    const fourth = parts[3] === undefined ? undefined : parseChannel(parts[3], 1)
    if ([...channels, ...(fourth === undefined ? [] : [fourth])].some((value) => !Number.isFinite(value))) {
      return { ok: false, code: 'notAColor' }
    }
    const [r, g, b] = channels
    const alphaValue = fourth ?? alpha
    if ([r, g, b].some((value) => value < 0 || value > 255) || alphaValue < 0 || alphaValue > 1) {
      return { ok: false, code: 'outOfRange' }
    }
    return { ok: true, rgb: { r, g, b, a: roundTo(alphaValue, 3) } }
  }

  if (name === 'hsl' || name === 'hsla') {
    if (parts.length < 3 || parts.length > 4) return { ok: false, code: 'notAColor' }
    const hue = Number(parts[0].replace(/deg$/i, ''))
    const saturation = parseChannel(parts[1], 100)
    const lightness = parseChannel(parts[2], 100)
    const fourth = parts[3] === undefined ? undefined : parseChannel(parts[3], 1)
    if ([hue, saturation, lightness, ...(fourth === undefined ? [] : [fourth])].some((value) => !Number.isFinite(value))) {
      return { ok: false, code: 'notAColor' }
    }
    if (saturation < 0 || saturation > 100 || lightness < 0 || lightness > 100) {
      return { ok: false, code: 'outOfRange' }
    }
    return { ok: true, rgb: fromHsl({ h: hue, s: saturation, l: lightness, a: fourth ?? alpha }) }
  }

  return { ok: false, code: 'notAColor' }
}

const hexPair = (value: number) => Math.round(clamp01(value / 255) * 255).toString(16).padStart(2, '0')

/** `#rgb` when the channels repeat, `#rrggbb` otherwise, with alpha appended. */
export function toHex(rgb: Rgb, { short = false, alpha = false } = {}): string {
  const pairs = [rgb.r, rgb.g, rgb.b].map(hexPair)
  const compact = short && pairs.every((pair) => pair[0] === pair[1])
  let out = `#${compact ? pairs.map((pair) => pair[0]).join('') : pairs.join('')}`
  if (alpha && rgb.a < 1) out += hexPair(rgb.a * 255)
  return out
}

export function toRgbText(rgb: Rgb): string {
  const alpha = rgb.a < 1 ? ` / ${roundTo(rgb.a, 3)}` : ''
  return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}${alpha})`
}

export function toHslText(rgb: Rgb): string {
  const hsl = toHsl(rgb)
  const alpha = rgb.a < 1 ? ` / ${roundTo(rgb.a, 3)}` : ''
  return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%${alpha})`
}

export function toOklch(rgb: Rgb): Oklch {
  const linear = (value: number) => {
    const channel = clamp01(value / 255)
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const r = linear(rgb.r)
  const g = linear(rgb.g)
  const b = linear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.sqrt(a * a + bAxis * bAxis)
  let hue = (Math.atan2(bAxis, a) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { l: roundTo(lightness, 4), c: roundTo(chroma, 4), h: roundTo(hue, 1), a: rgb.a }
}

export function toOklchText(rgb: Rgb): string {
  const oklch = toOklch(rgb)
  const alpha = rgb.a < 1 ? ` / ${roundTo(oklch.a, 3)}` : ''
  return `oklch(${oklch.l * 100}% ${oklch.c} ${oklch.h}${alpha})`
}

/** Lays a translucent colour over an opaque one, because that is what a reader sees. */
export function composite(foreground: Rgb, background: Rgb): Rgb {
  if (foreground.a >= 1) return { ...foreground, a: 1 }
  const over = (top: number, bottom: number) => top * foreground.a + bottom * (1 - foreground.a)
  return {
    r: over(foreground.r, background.r),
    g: over(foreground.g, background.g),
    b: over(foreground.b, background.b),
    a: 1
  }
}

/** The WCAG relative luminance of an opaque colour. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (value: number) => {
    const scaled = clamp01(value / 255)
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/**
 * The contrast ratio between two colours. Translucent input is laid over an
 * explicit background rather than guessed, so the number always describes a pair
 * a reader could actually be looking at.
 */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const base = composite(background, { r: 255, g: 255, b: 255, a: 1 })
  const top = composite(foreground, base)
  const lighter = Math.max(relativeLuminance(top), relativeLuminance(base))
  const darker = Math.min(relativeLuminance(top), relativeLuminance(base))
  return roundTo((lighter + 0.05) / (darker + 0.05), 2)
}

export type ContrastGrade = 'aaa' | 'aa' | 'aa-large' | 'fail'

/**
 * Grades a ratio the way WCAG does. Large text is anything 18pt, or 14pt bold,
 * which is the only case where the 3:1 floor applies.
 */
export function gradeContrast(ratio: number, largeText = false): ContrastGrade {
  if (ratio >= 7) return 'aaa'
  if (ratio >= 4.5) return 'aa'
  if (largeText && ratio >= 3) return 'aa-large'
  return 'fail'
}

/** The ratio a pair has to clear for the given grade, or null when it fails. */
export function requiredRatio(grade: 'aaa' | 'aa' | 'aa-large'): number {
  if (grade === 'aaa') return 7
  if (grade === 'aa') return 4.5
  return 3
}

/**
 * Black or white, whichever is more readable on this background. The naive
 * "pick black, check, else pick white" gets both of them wrong more often than
 * it gets them right, because it never compares the two.
 */
export function readableInk(background: Rgb): Rgb {
  const white: Rgb = { r: 255, g: 255, b: 255, a: 1 }
  const black: Rgb = { r: 0, g: 0, b: 0, a: 1 }
  return contrastRatio(white, background) >= contrastRatio(black, background) ? white : black
}