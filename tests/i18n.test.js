import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  defaultLocale,
  isLocale,
  localeFromPath,
  localeMeta,
  localePath,
  locales,
  localeStorageKey,
  matchBrowserLocale,
  prefixedLocales,
  stripLocalePrefix
} from '../src/i18n/config.ts'
import { createTranslator, resolveLocale, translate } from '../src/i18n/index.ts'
import { currentIntlLocale, currentLocale, currentTranslator } from '../src/i18n/client.ts'

// ------------------------------------------------------------------ locale config

test('exposes four locales with the default locale unprefixed', () => {
  assert.deepEqual([...locales], ['zh-CN', 'en', 'ja', 'zh-TW'])
  assert.equal(defaultLocale, 'zh-CN')
  assert.equal(localeMeta['zh-CN'].prefix, '')
  assert.deepEqual([...prefixedLocales], ['en', 'ja', 'zh-TW'])
  assert.equal(localeStorageKey, 'code-space-locale')
})

test('maps html lang attributes for the html lang attribute', () => {
  assert.equal(localeMeta['zh-CN'].htmlLang, 'zh-Hans')
  assert.equal(localeMeta['zh-TW'].htmlLang, 'zh-Hant')
  assert.equal(localeMeta.en.htmlLang, 'en')
  assert.equal(localeMeta.ja.htmlLang, 'ja')
})

test('recognises only supported locale values', () => {
  assert.equal(isLocale('zh-TW'), true)
  assert.equal(isLocale('zh-Hant'), false)
  assert.equal(isLocale('fr'), false)
  assert.equal(isLocale(42), false)
  assert.equal(isLocale(null), false)
  assert.equal(resolveLocale('ja'), 'ja')
  assert.equal(resolveLocale('nope'), defaultLocale)
  assert.equal(resolveLocale(undefined), defaultLocale)
})

// ------------------------------------------------------------------ URL prefixes

test('strips a leading locale prefix', () => {
  assert.equal(stripLocalePrefix('/en/tools/base64/'), '/tools/base64/')
  assert.equal(stripLocalePrefix('/ja/'), '/')
  assert.equal(stripLocalePrefix('/zh-tw/tools/json-format/'), '/tools/json-format/')
  assert.equal(stripLocalePrefix('/tools/base64/'), '/tools/base64/')
  assert.equal(stripLocalePrefix(''), '/')
  // a prefix may only match on a path segment boundary
  assert.equal(stripLocalePrefix('/enterprise/tools/'), '/enterprise/tools/')
})

test('builds locale aware paths, keeping the default locale at the root', () => {
  assert.equal(localePath('zh-CN', '/tools/base64/'), '/tools/base64/')
  assert.equal(localePath('en', '/tools/base64/'), '/en/tools/base64/')
  assert.equal(localePath('ja', '/'), '/ja/')
  assert.equal(localePath('zh-TW', '/tools/'), '/zh-tw/tools/')
})

test('converts between locales without losing the trailing shape', () => {
  assert.equal(localePath('zh-TW', '/en/tools/uuid-generator/'), '/zh-tw/tools/uuid-generator/')
  assert.equal(localePath('en', '/zh-tw/tools/uuid-generator/'), '/en/tools/uuid-generator/')
  assert.equal(localePath('zh-CN', '/zh-tw/'), '/')
  // the same target is produced no matter which locale prefix the input carries
  for (const source of ['/tools/', '/en/tools/', '/ja/tools/', '/zh-tw/tools/']) {
    assert.equal(localePath('zh-TW', source), '/zh-tw/tools/', source)
  }
  for (const source of ['/tools/', '/en/tools/', '/zh-tw/tools/']) {
    assert.equal(localePath('zh-CN', source), '/tools/', source)
  }
})

test('reads the locale back out of a path', () => {
  assert.equal(localeFromPath('/zh-tw/tools/json-format/'), 'zh-TW')
  assert.equal(localeFromPath('/ja'), 'ja')
  assert.equal(localeFromPath('/en/'), 'en')
  assert.equal(localeFromPath('/tools/base64/'), defaultLocale)
  assert.equal(localeFromPath('/'), defaultLocale)
})

test('round trips locale and path for every locale', () => {
  for (const locale of locales) {
    for (const path of ['/', '/tools/', '/tools/base64/', '/tools/json-format/']) {
      const localized = localePath(locale, path)
      assert.equal(localeFromPath(localized), locale, `${locale} ${path} -> ${localized}`)
      assert.equal(stripLocalePrefix(localized), path, `${locale} ${path} -> ${localized}`)
    }
  }
})

// ------------------------------------------------------------------ browser matching

test('prefers an exact supported tag from the Accept-Language list', () => {
  assert.equal(matchBrowserLocale(['en-US', 'zh-CN']), 'en')
  assert.equal(matchBrowserLocale(['ja']), 'ja')
  assert.equal(matchBrowserLocale(['  ZH-TW  ']), 'zh-TW')
})

test('routes traditional Chinese by script subtag or region', () => {
  for (const tag of ['zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO', 'zh-TW']) {
    assert.equal(matchBrowserLocale([tag]), 'zh-TW', tag)
  }
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-SG', 'zh-Hans-CN']) {
    assert.equal(matchBrowserLocale([tag]), 'zh-CN', tag)
  }
})

test('falls back to the default locale for empty or unusable input', () => {
  assert.equal(matchBrowserLocale([]), defaultLocale)
  assert.equal(matchBrowserLocale(null), defaultLocale)
  assert.equal(matchBrowserLocale(undefined), defaultLocale)
  assert.equal(matchBrowserLocale(['', '   ']), defaultLocale)
  assert.equal(matchBrowserLocale(['fr-FR', 'de']), defaultLocale)
  assert.equal(matchBrowserLocale(['fr', 'ja-JP']), 'ja')
})

// ------------------------------------------------------------------ translation

test('translates a message key per locale', () => {
  assert.equal(translate('zh-CN', 'workspace.waiting'), '等待处理')
  assert.notEqual(translate('en', 'workspace.waiting'), '等待处理')
  assert.equal(translate('ja', 'workspace.waiting'), '処理待ち')
  assert.equal(translate('zh-TW', 'workspace.waiting'), '等待處理')
})

test('interpolates named variables', () => {
  assert.equal(translate('en', 'toolUi.json-format.errors.unrecognizedCharacter', { char: '@' }), 'Unrecognized character @')
  assert.equal(translate('zh-CN', 'toolUi.json-format.errors.unrecognizedCharacter', { char: '@' }), '无法识别的字符 @')
  // numbers are accepted and rendered, so counts do not need pre-stringifying
  assert.equal(translate('en', 'toolUi.query-string.runtime.lengthUnit', { count: 12 }), '12 characters')
  assert.equal(translate('zh-CN', 'toolUi.query-string.runtime.lengthUnit', { count: 12 }), '12 字符')
})

test('leaves unmatched placeholders untouched', () => {
  assert.equal(translate('en', 'toolUi.json-format.errors.unrecognizedCharacter', {}), 'Unrecognized character {char}')
})

test('falls back to the default locale, then to the key itself', () => {
  assert.equal(translate('en', 'nope.not.a.key'), 'nope.not.a.key')
  const t = createTranslator('ja')
  assert.equal(typeof t('workspace.waiting'), 'string')
})

test('every locale defines a non-empty string for every key', () => {
  const t = createTranslator('zh-CN')
  assert.equal(t('toolUi.json-format.name').length > 0, true)
  for (const locale of locales) {
    const translator = createTranslator(locale)
    assert.notEqual(translator('tools.base64.name'), '')
    assert.notEqual(translator('categories.security'), '')
    assert.notEqual(translator('common.copy'), '')
  }
})

test('traditional Chinese uses traditional characters for shared scaffolding', () => {
  // These strings exist verbatim in the zh-CN dictionary, so a copy/paste
  // regression from zh-CN would show up here as simplified output.
  assert.equal(translate('zh-TW', 'common.copy'), '複製')
  assert.equal(translate('zh-TW', 'workspace.copyResult'), '複製結果')
  assert.equal(translate('zh-TW', 'workspace.charPosition'), '第 {position} 個字元：')
  assert.equal(translate('zh-CN', 'workspace.charPosition'), '第 {position} 个字符：')
})

// ------------------------------------------------------------------ client translator

/** Runs `body` with a stubbed `document.documentElement.dataset.locale`. */
function withDocument(locale, body) {
  const previous = globalThis.document
  globalThis.document = { documentElement: { dataset: locale === undefined ? {} : { locale } } }
  try {
    body()
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
}

test('client helpers default to the default locale without a document', () => {
  const previous = globalThis.document
  delete globalThis.document
  try {
    assert.equal(currentLocale(), defaultLocale)
    assert.equal(currentIntlLocale(), 'zh-Hans')
    assert.equal(currentTranslator()('workspace.waiting'), '等待处理')
  } finally {
    if (previous !== undefined) globalThis.document = previous
  }
})

test('client helpers follow the locale rendered into the html element', () => {
  for (const locale of locales) {
    withDocument(locale, () => {
      assert.equal(currentLocale(), locale)
      assert.equal(currentIntlLocale(), localeMeta[locale].htmlLang)
      assert.equal(currentTranslator()('workspace.waiting'), translate(locale, 'workspace.waiting'))
    })
  }
})

test('client helpers fall back when the document locale is missing or unsupported', () => {
  withDocument(undefined, () => assert.equal(currentLocale(), defaultLocale))
  withDocument('fr', () => {
    assert.equal(currentLocale(), defaultLocale)
    assert.equal(currentIntlLocale(), 'zh-Hans')
  })
})
