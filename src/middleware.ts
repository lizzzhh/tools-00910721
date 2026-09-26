import { defineMiddleware } from 'astro:middleware'
import { localeFromPath } from './i18n/config'

/**
 * Resolves the active locale from the request path so every component and
 * layout can read `Astro.locals.locale` without prop drilling. The default
 * locale keeps the unprefixed URLs, so `/tools/hash/` is zh-CN while
 * `/en/tools/hash/` and `/ja/tools/hash/` carry their prefix.
 */
export const onRequest = defineMiddleware((context, next) => {
  context.locals.locale = localeFromPath(context.url.pathname)
  return next()
})
