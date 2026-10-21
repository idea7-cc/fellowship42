import type { PluginDescriptor, ResolvedPlugin } from 'emdash'
import { definePlugin } from 'emdash'
import { version } from '../package.json'
import { loadConnection } from './environment'
import { CONNECTION_SETTINGS, PLUGIN_ID, sourceFor } from './shared/connection'
import { portableTextBlocks } from './shared/blocks'
import { churchJsonLd, isHomePage } from './shared/jsonld'
import { connectionStatus } from './shared/status'
import { contractTransport } from './transport'

/**
 * Fellowship42 church content for EmDash.
 *
 * Register in `astro.config.mjs`:
 *
 * ```js
 * import { fellowship42 } from '@fellowship42/emdash'
 * emdash({ plugins: [fellowship42()] })
 * ```
 *
 * The deployment pins the connection with `FELLOWSHIP42_URL` (address,
 * optionally carried by a `FELLOWSHIP42` service binding) and
 * `FELLOWSHIP42_INSTANCE_SHA256` (church identity). Whatever it leaves unset
 * comes from plugin settings that only Administrators edit; an address from
 * settings must be public unless `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` or
 * the site runs under `astro dev`.
 */
export function fellowship42(): PluginDescriptor {
  return {
    id: PLUGIN_ID,
    version,
    format: 'native',
    entrypoint: '@fellowship42/emdash',
    componentsEntry: '@fellowship42/emdash/astro',
    options: {},
  }
}

function connection(settings: { get<T>(key: string): Promise<T | null> }) {
  return loadConnection((key) => settings.get(key))
}

export function createPlugin(): ResolvedPlugin {
  return definePlugin({
    id: PLUGIN_ID,
    version,
    admin: {
      settingsSchema: {
        [CONNECTION_SETTINGS.url]: {
          type: 'url',
          label: 'Fellowship42 address',
          description:
            "The church instance's public address, for example https://app.example.org. Local and private network addresses are refused unless the website deployment sets FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true. Ignored when the website deployment sets FELLOWSHIP42_URL.",
        },
        [CONNECTION_SETTINGS.instance]: {
          type: 'string',
          label: 'Church identity (optional)',
          description:
            'The full 64-character church identity digest. Copy it from the Fellowship42 page in this admin, from instance.portableIdentitySha256 at <address>/api/website/v1, or from bootstrap.portableIdentitySha256 at <address>/api/health. When set, the website refuses any other church. Ignored when the website deployment sets FELLOWSHIP42_URL or FELLOWSHIP42_INSTANCE_SHA256.',
        },
      },
      pages: [{ path: '/status', label: 'Fellowship42' }],
      portableTextBlocks,
    },
    routes: {
      // Block Kit page. Everyone who can insert church blocks (Contributors
      // and up) may read it to learn where church content is edited.
      admin: {
        permission: 'content:create',
        handler: async (ctx) => {
          const config = await connection(ctx.settings)
          return connectionStatus(config, contractTransport(config), {
            viewerRole: ctx.user?.role,
          })
        },
      },
    },
    hooks: {
      'page:metadata': async (event, ctx) => {
        if (!isHomePage(event.page.path)) return null
        const config = await connection(ctx.settings)
        const result = await sourceFor(
          config,
          contractTransport(config),
        ).church()
        if (!result.ok) return null
        return {
          kind: 'jsonld',
          id: 'fellowship42-church',
          graph: churchJsonLd(
            result.data.church,
            new URL('/', event.page.url).href,
          ),
        }
      },
    },
  })
}

export default createPlugin

export { PLUGIN_ID, BLOCK_TYPES } from './shared/index'
