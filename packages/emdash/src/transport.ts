import type { ContractFetch } from '@fellowship42/website-contract'
import { CONNECTION_ENV, type ConnectionConfig } from './shared/connection'

export interface ServiceBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>
}

let binding: Promise<ServiceBinding | null> | undefined

/**
 * The instance Worker's service binding, when this site runs on Cloudflare in
 * the same account. Resolved once; any failure falls back to public HTTPS.
 */
export function serviceBinding(): Promise<ServiceBinding | null> {
  binding ??= (async () => {
    try {
      const specifier = 'cloudflare:workers'
      const workers = (await import(/* @vite-ignore */ specifier)) as {
        env?: Record<string, unknown>
      }
      const candidate = workers.env?.[CONNECTION_ENV.binding] as
        ServiceBinding | undefined
      return candidate && typeof candidate.fetch === 'function'
        ? candidate
        : null
    } catch {
      return null
    }
  })()
  return binding
}

/**
 * Trusted transport for one connection. The service binding carries the
 * requests only when the deployment pins the address (`FELLOWSHIP42_URL`);
 * an address from plugin settings always goes through the runtime's `fetch`,
 * so it reaches the instance it names. Server-side requests carry no visitor
 * cookies or credentials.
 */
export function contractTransport(
  config: Pick<ConnectionConfig, 'pinned'>,
  resolveBinding: () => Promise<ServiceBinding | null> = serviceBinding,
): ContractFetch {
  return async (url, init) => {
    const service = config.pinned ? await resolveBinding() : null
    return service ? service.fetch(url, init) : fetch(url, init)
  }
}
