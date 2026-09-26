import { defineConfig } from 'astro/config'
import icon from 'astro-icon'

// Absolute origin used for canonical and hreflang URLs. Set PUBLIC_SITE_URL in
// the deploy environment; the placeholder keeps local builds working.
const site = process.env.PUBLIC_SITE_URL ?? 'https://example.com'

export default defineConfig({
  site,
  output: 'static',
  integrations: [icon()],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto'
  }
})
