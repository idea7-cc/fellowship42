import { env } from 'cloudflare:workers'

/**
 * Bindings whose D1 runs `beforeBatch` once, just before the route's first
 * write batch: a concurrent change that lands after the route's reads.
 */
export function interleaveBeforeBatch(beforeBatch: () => Promise<unknown>) {
  let pending: (() => Promise<unknown>) | null = beforeBatch
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          const run = pending
          pending = null
          await run?.()
          return target.batch(statements)
        }
      }
      const value: unknown = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  // Define rather than assign: assigning through the `env` proxy prototype
  // would replace the shared binding for every other test.
  return Object.create(env, { DB: { value: db } }) as Env
}
