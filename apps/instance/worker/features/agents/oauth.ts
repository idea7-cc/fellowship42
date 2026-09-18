import {
  OAuthProvider,
  OAuthError,
  type OAuthProviderOptions,
  getOAuthApi,
} from '@cloudflare/workers-oauth-provider'
import { agentScopes } from '../../../contracts/agents'
import { AppError } from '../../lib/errors'
import { agentPropsSchema, requireAgentAccess } from './access'
import { serveChurchMcp } from './mcp'
import { disconnectAgent } from './disconnect'

type FetchHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Response | Promise<Response>

export function agentOrigin(env: Env): string | null {
  if (!env.MCP_ORIGIN) return null
  const url = new URL(env.MCP_ORIGIN)
  if (
    url.origin !== env.MCP_ORIGIN ||
    (url.protocol !== 'https:' &&
      !(
        env.ENVIRONMENT !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new AppError(
      503,
      'agent_configuration_invalid',
      'Agent connections are not configured.',
    )
  return url.origin
}

function providerOptions(
  env: Env,
  defaultFetch: FetchHandler,
): OAuthProviderOptions<Env> {
  const origin = agentOrigin(env)
  if (!origin)
    throw new AppError(
      503,
      'agents_not_configured',
      'Agent connections are not configured.',
    )
  return {
    apiRoute: '/mcp',
    apiHandler: {
      fetch: (request, bindings, ctx) =>
        serveChurchMcp(request, bindings, ctx.props, ctx),
    },
    defaultHandler: { fetch: defaultFetch },
    authorizeEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    // CIMD is preferred. Library-managed DCR also supports clients that use
    // registration rather than publishing a metadata document.
    clientRegistrationEndpoint: `${origin}/oauth/register`,
    clientIdMetadataDocumentEnabled: true,
    // Client metadata must survive renewed grants; grants and tokens expire
    // independently. Reset this disposable registry when restoring an instance.
    clientRegistrationTTL: undefined,
    accessTokenTTL: 15 * 60,
    refreshTokenTTL: 30 * 24 * 60 * 60,
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    allowTokenExchangeGrant: false,
    onError: ({ status, code }) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'oauth.request_rejected',
          status,
          code,
        }),
      )
    },
    scopesSupported: agentScopes,
    resourceMetadata: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: agentScopes,
      bearer_methods_supported: ['header'],
      resource_name: 'Fellowship42 church',
    },
    tokenExchangeCallback: async (options) => {
      const parsed = agentPropsSchema.safeParse(options.props)
      if (
        !parsed.success ||
        options.userId !== parsed.data.userId ||
        options.clientId !== parsed.data.clientId
      )
        throw new OAuthError('invalid_grant', {
          description: 'The connection is no longer authorized.',
        })
      const props = {
        ...parsed.data,
        scopes: agentScopeList(options.requestedScope),
      }
      try {
        await requireAgentAccess(env.DB, props)
      } catch {
        throw new OAuthError('invalid_grant', {
          description: 'The connection is no longer authorized.',
        })
      }
      await env.DB.prepare(
        'UPDATE agent_connections SET provider_grant_id = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      )
        .bind(options.grantId, props.connectionId, props.userId)
        .run()
      return { accessTokenProps: props }
    },
  }
}
function agentScopeList(scopes: string[]) {
  const result = agentPropsSchema.shape.scopes.safeParse(scopes)
  if (!result.success)
    throw new OAuthError('invalid_scope', {
      description: 'The requested scopes are invalid.',
    })
  return result.data
}
export function agentOAuth(env: Env) {
  return getOAuthApi(
    providerOptions(env, () => new Response('Not found', { status: 404 })),
    env,
  )
}

export async function agentFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  defaultFetch: FetchHandler,
) {
  const path = new URL(request.url).pathname
  if (!(
    path === '/mcp' ||
    path.startsWith('/mcp/') ||
    path.startsWith('/oauth/') ||
    path.startsWith('/.well-known/oauth-')
  ))
    return defaultFetch(request, env, ctx)
  let response: Response
  try {
    if (path.startsWith('/mcp/'))
      return new Response('Not found', { status: 404 })
    const origin = agentOrigin(env)
    if (!origin) return new Response('Not found', { status: 404 })
    if (new URL(request.url).origin !== origin)
      return new Response('Invalid origin', { status: 400 })
    // Browser requests are same-origin; remote native/server agents omit Origin.
    if (
      request.headers.has('Origin') &&
      request.headers.get('Origin') !== origin
    )
      return new Response('Invalid origin', { status: 403 })
    if (request.body) {
      const reader = request.clone().body!.getReader()
      let bytes = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > 64 * 1024)
            return new Response('Request too large', { status: 413 })
        }
      } finally {
        void reader.cancel().catch(() => {})
      }
    }
    if (path === '/oauth/disconnect')
      response = await disconnectAgent(request, env, ctx)
    else {
      const provider = new OAuthProvider(providerOptions(env, defaultFetch))
      response = await provider.fetch(request, env, ctx)
    }
  } catch (error) {
    response = Response.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'agent_request_failed',
          message:
            error instanceof AppError
              ? error.message
              : 'The agent request could not be completed.',
        },
      },
      { status: error instanceof AppError ? error.status : 500 },
    )
  }
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, { status: response.status, headers })
}
