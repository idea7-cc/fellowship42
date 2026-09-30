import type { PluginDescriptor, ResolvedPlugin } from 'emdash'
import { definePlugin } from 'emdash'
import { version } from '../package.json'
import {
  CONNECTION_SETTINGS,
  PLUGIN_ID,
  processEnv,
  resolveConnectionConfig,
  sourceFor,
  type ConnectionConfig,
} from './shared/connection'
import { portableTextBlocks } from './shared/blocks'
import { churchJsonLd, isHomePage } from './shared/jsonld'
import { connectionStatusBlocks } from './shared/status'
import { nativeFetch } from './transport'

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
 * The connection comes from the deployment (`FELLOWSHIP42_URL`, optional
 * `FELLOWSHIP42_INSTANCE_SHA256` and `FELLOWSHIP42` service binding) or,
 * when those are unset, from plugin settings that only Administrators edit.
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

async function connection(settings: {
  get<T>(key: string): Promise<T | null>
}): Promise<ConnectionConfig> {
  return resolveConnectionConfig(processEnv(), {
    [CONNECTION_SETTINGS.url]: await settings.get(CONNECTION_SETTINGS.url),
    [CONNECTION_SETTINGS.instance]: await settings.get(
      CONNECTION_SETTINGS.instance,
    ),
  })
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
            'The church instance, for example https://app.example.org. Ignored when the website deployment sets FELLOWSHIP42_URL.',
        },
        [CONNECTION_SETTINGS.instance]: {
          type: 'string',
          label: 'Church identity (optional)',
          description:
            'The instance identity digest shown on the Fellowship42 page. When set, the website refuses any other church.',
        },
      },
      pages: [{ path: '/', label: 'Fellowship42' }],
      portableTextBlocks,
    },
    routes: {
      // Block Kit page. Editors may read it so they know where to edit what.
      admin: {
        permission: 'plugins:read',
        handler: async (ctx) => {
          const config = await connection(ctx.settings)
          const described = await sourceFor(config, nativeFetch).describe()
          return connectionStatusBlocks(config, described)
        },
      },
    },
    hooks: {
      'page:metadata': async (event, ctx) => {
        if (!isHomePage(event.page.path)) return null
        const result = await sourceFor(
          await connection(ctx.settings),
          nativeFetch,
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
