import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import { d1, r2 } from '@emdash-cms/cloudflare'
import { fellowship42 } from '@fellowship42/emdash'
import { defineConfig } from 'astro/config'
import emdash from 'emdash/astro'

// An EmDash site the church already operates (upstream starter-cloudflare
// shape). The only Fellowship42-specific line is the plugin registration the
// EmDash-first guide asks a site developer to add.
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  image: {
    layout: 'constrained',
    responsiveStyles: true,
  },
  integrations: [
    react(),
    emdash({
      database: d1({ binding: 'DB', session: 'auto' }),
      storage: r2({ binding: 'MEDIA' }),
      plugins: [fellowship42()],
      // Deterministic offline builds: no Google Fonts download at build time.
      fonts: false,
    }),
  ],
  devToolbar: { enabled: false },
})
