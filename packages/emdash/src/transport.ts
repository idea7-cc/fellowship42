import type { ContractFetch } from '@fellowship42/website-contract'
import { CONNECTION_ENV } from './shared/connection'

interface ServiceBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>
}

let binding: Promise<ServiceBinding | null> | undefined

/**
 * The instance Worker's service binding, when this site runs on Cloudflare in
 * the same account. Resolved once; any failure falls back to public HTTPS.
 */
function serviceBinding(): Promise<ServiceBinding | null> {
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
 * Trusted transport: a service binding when present, otherwise the runtime's
 * `fetch`. Unlike sandboxed plugin HTTP it can reach a local development
 * instance. Server-side requests carry no visitor cookies or credentials.
 */
export const nativeFetch: ContractFetch = async (url, init) => {
  const service = await serviceBinding()
  return service ? service.fetch(url, init) : fetch(url, init)
}
