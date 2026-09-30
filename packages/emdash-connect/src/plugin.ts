import type { PluginContext, SandboxedPlugin } from 'emdash/plugin'
import {
  CONNECTION_SETTINGS,
  churchJsonLd,
  connectionStatusBlocks,
  isHomePage,
  resolveConnectionConfig,
  sourceFor,
} from '@fellowship42/emdash/shared'
import type {
  ContractFetch,
  ListResource,
  SourceResult,
} from '@fellowship42/website-contract'

/**
 * Registry connector for a Fellowship42 church. It runs in EmDash's plugin
 * sandbox, so it reaches the instance only through `ctx.http` (public
 * addresses only) and holds no credential: everything it reads is the
 * church's published website contract.
 */

async function config(ctx: PluginContext) {
  // A sandbox cannot read deployment variables; Administrators set these.
  return resolveConnectionConfig(
    {},
    {
      [CONNECTION_SETTINGS.url]: await ctx.settings.get(
        CONNECTION_SETTINGS.url,
      ),
      [CONNECTION_SETTINGS.instance]: await ctx.settings.get(
        CONNECTION_SETTINGS.instance,
      ),
    },
  )
}

function transport(ctx: PluginContext): ContractFetch {
  const http = ctx.http
  if (!http) return () => Promise.reject(new Error('network not granted'))
  return (url, init) =>
    http.fetch(url, { method: init.method, headers: init.headers })
}

async function source(ctx: PluginContext) {
  return sourceFor(await config(ctx), transport(ctx))
}

/** Same shape for every data route: data, or a named unavailable state. */
function reply<T>(result: SourceResult<T>) {
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, state: result.state, message: result.message }
}

function listRoute(resource: ListResource) {
  return {
    public: true,
    methods: ['GET' as const],
    handler: async (
      routeCtx: { request: { url: string } },
      ctx: PluginContext,
    ) => {
      const params = new URL(routeCtx.request.url).searchParams
      return reply(
        await (
          await source(ctx)
        ).list(resource, {
          cursor: params.get('cursor'),
          limit: Number(params.get('limit') ?? 20) || 20,
        }),
      )
    },
  }
}

const plugin: SandboxedPlugin = {
  routes: {
    // Block Kit status page. Editors may read it; only Administrators change
    // the connection, through the generated settings form.
    admin: {
      permission: 'plugins:read',
      handler: async (_routeCtx, ctx) => {
        const current = await config(ctx)
        return connectionStatusBlocks(
          current,
          await sourceFor(current, transport(ctx)).describe(),
          { sandboxed: true },
        )
      },
    },
    church: {
      public: true,
      methods: ['GET'],
      handler: async (_routeCtx, ctx) =>
        reply(await (await source(ctx)).church()),
    },
    events: listRoute('events'),
    sermons: listRoute('sermons'),
    groups: listRoute('groups'),
    courses: listRoute('courses'),
  },
  hooks: {
    'page:metadata': async (event, ctx) => {
      if (!isHomePage(event.page.path)) return null
      const result = await (await source(ctx)).church()
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
}

export default plugin
