export const locales = ['zh-CN', 'en', 'ja', 'zh-TW'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-CN'

export type LocaleMeta = {
  /** Endonym shown in the switcher; never translated. */
  label: string
  /** Value for the html lang attribute. */
  htmlLang: string
  /** URL prefix; empty for the default locale so existing URLs keep working. */
  prefix: string
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  'zh-CN': { label: '简体中文', htmlLang: 'zh-Hans', prefix: '' },
  en: { label: 'English', htmlLang: 'en', prefix: 'en' },
  ja: { label: '日本語', htmlLang: 'ja', prefix: 'ja' },
  'zh-TW': { label: '繁體中文', htmlLang: 'zh-Hant', prefix: 'zh-tw' }
}

export const localeStorageKey = 'code-space-locale'

/** Locales that get a URL prefix; the default locale stays unprefixed at the root. */
export const prefixedLocales: Locale[] = locales.filter((locale) => localeMeta[locale].prefix !== '')

/** Removes a leading locale prefix, returning the locale-agnostic path. */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of prefixedLocales) {
    const { prefix } = localeMeta[locale]
    if (pathname === `/${prefix}` || pathname === `/${prefix}/`) return '/'
    if (pathname.startsWith(`/${prefix}/`)) return `/${pathname.slice(prefix.length + 2)}`
  }
  return pathname || '/'
}

/** Maps any pathname onto the equivalent path for the target locale. */
export function localePath(locale: Locale, pathname: string): string {
  const base = stripLocalePrefix(pathname || '/')
  const { prefix } = localeMeta[locale]
  if (!prefix) return base
  return base === '/' ? `/${prefix}/` : `/${prefix}${base}`
}

export function localeFromPath(pathname: string): Locale {
  for (const locale of prefixedLocales) {
    const { prefix } = localeMeta[locale]
    if (pathname === `/${prefix}` || pathname === `/${prefix}/` || pathname.startsWith(`/${prefix}/`)) return locale
  }
  return defaultLocale
}

const exactTags: Record<string, Locale> = {
  'zh-hans': 'zh-CN',
  'zh-hans-cn': 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-my': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh-hant-tw': 'zh-TW',
  'zh-hant-hk': 'zh-TW',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
  en: 'en',
  ja: 'ja'
}

/**
 * Picks the best supported locale from an Accept-Language style list.
 * Traditional Chinese is matched on the script subtag or the region, so
 * zh-Hant/zh-HK/zh-TW resolve to zh-TW while other zh variants stay simplified.
 */
export function matchBrowserLocale(acceptLanguages: readonly string[] | null | undefined): Locale {
  for (const raw of acceptLanguages ?? []) {
    const tag = raw.toLowerCase().trim()
    if (!tag) continue
    const exact = exactTags[tag]
    if (exact) return exact
    if (tag.startsWith('zh')) {
      return /hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN'
    }
    const language = tag.split('-')[0]
    if (language === 'en' || language === 'ja') return language
  }
  return defaultLocale
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}
