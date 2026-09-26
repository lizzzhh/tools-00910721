/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Resolved from the request path by src/middleware.ts. */
    locale: import('./i18n/config').Locale
  }
}
