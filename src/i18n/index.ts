import { defaultLocale, isLocale, locales, type Locale } from './config.ts'
import en from './locales/en.ts'
import ja from './locales/ja.ts'
import zhCN from './locales/zh-CN.ts'
import zhTW from './locales/zh-TW.ts'

export type { Locale } from './config.ts'
export { defaultLocale, isLocale, localeMeta, localePath, localeStorageKey, locales, localeFromPath, matchBrowserLocale, stripLocalePrefix } from './config.ts'

/**
 * The zh-CN dictionary defines the shape every other locale must satisfy.
 * It is intentionally not `as const`, so the leaf types stay `string` and the
 * other dictionaries can supply their own wording while TypeScript still
 * rejects any missing or misspelled key.
 */
export type Dictionary = typeof zhCN

const dictionaries: Record<Locale, Dictionary> = {
  'zh-CN': zhCN,
  en,
  ja,
  'zh-TW': zhTW
}

type Join<K extends string, P extends string> = P extends '' ? K : `${P}.${K}`

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<K, P> : Paths<T[K], Join<K, P>>
}[keyof T & string]

export type MessageKey = Paths<Dictionary>

export type TranslateVars = Record<string, string | number>

function flatten(source: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else if (value && typeof value === 'object') flatten(value, path, out)
  }
  return out
}

const flattened = new Map<Locale, Record<string, string>>(
  locales.map((locale) => [locale, flatten(dictionaries[locale])])
)

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/**
 * Looks up a dotted message key. Unknown keys fall back to the default locale
 * and finally to the key itself, so a missing translation degrades to Chinese
 * rather than rendering an empty label.
 */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const table = flattened.get(locale) ?? flattened.get(defaultLocale)
  const value = table?.[key] ?? flattened.get(defaultLocale)?.[key]
  return interpolate(value ?? key, vars)
}

export type Translator = (key: MessageKey, vars?: TranslateVars) => string

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars)
}

/** Resolves an arbitrary stored or detected value to a supported locale. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale
}
