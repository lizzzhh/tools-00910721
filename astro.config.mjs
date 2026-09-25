import { defineConfig } from 'astro/config'
import icon from 'astro-icon'

export default defineConfig({
  output: 'static',
  integrations: [icon()],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto'
  }
})
