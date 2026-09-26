import { createTranslator, type MessageKey, type Translator } from './index.ts'
import { isLocale, localeMeta, type Locale } from './config.ts'

/**
 * Reads the active locale from the document. Every client script goes through
 * this so the same page logic can render in any language, and a client-side
 * navigation between locales keeps working.
 */
export function currentLocale(): Locale {
  if (typeof document === 'undefined') return 'zh-CN'
  const attr = document.documentElement.dataset.locale
  return isLocale(attr) ? attr : 'zh-CN'
}

export function currentTranslator(): Translator {
  return createTranslator(currentLocale())
}

/** BCP 47 tag for Intl, so dates and numbers format per locale. */
export function currentIntlLocale(): string {
  return localeMeta[currentLocale()].htmlLang
}

export function translateNow(key: MessageKey, vars?: Record<string, string | number>): string {
  return currentTranslator()(key, vars)
}
