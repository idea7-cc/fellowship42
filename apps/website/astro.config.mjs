import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import { d1, r2 } from '@emdash-cms/cloudflare'
import { fellowship42 } from '@fellowship42/emdash'
import { defineConfig } from 'astro/config'
import emdash from 'emdash/astro'

// The church website of a Fellowship42 installation. EmDash owns pages,
// articles, menus, and presentation; church records are read at request time
// from the installation's Fellowship42 instance through the public contract.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [
    react(),
    emdash({
      database: d1({ binding: 'DB' }),
      storage: r2({ binding: 'MEDIA' }),
      plugins: [fellowship42()],
      // Gates first-administrator setup on a Fellowship42 owner claim and
      // keeps public pages uncached so withdrawals show on the next visit.
      middleware: {
        outer: new URL('./src/outer-middleware.ts', import.meta.url),
      },
      // Offline, deterministic builds: no font CDN, update pings, or registry.
      fonts: false,
      updateCheck: false,
      registry: false,
    }),
  ],
  devToolbar: { enabled: false },
})
