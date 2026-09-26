import type { APIRoute } from 'astro'
import { tools } from '../data/tools'
import { localeMeta, localePath, locales, prefixedLocales } from '../i18n/config'

/**
 * Every page in every locale, each entry carrying the full hreflang set so
 * search engines can discover the translations without crawling every variant.
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://example.com')).origin

  const paths = ['/', '/tools/', '/favorites/', '/about/', ...tools.map((tool) => `/tools/${tool.id}/`)]
  const urls = paths.flatMap((path) => [
    { path, locale: 'zh-CN' as const },
    ...prefixedLocales.map((locale) => ({ path: localePath(locale, path), locale }))
  ])

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(({ path, locale }) => {
    const alternates = locales
      .map((candidate) => `    <xhtml:link rel="alternate" hreflang="${localeMeta[candidate].htmlLang}" href="${origin}${localePath(candidate, path)}" />`)
      .join('\n')
    return `  <url>
    <loc>${origin}${path}</loc>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${path}" />
  </url>`
  })
  .join('\n')}
</urlset>
`

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
