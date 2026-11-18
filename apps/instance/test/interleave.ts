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

/**
 * Bindings whose D1 runs `change` once, either right after the first
 * `.first()` or `.all()` read whose SQL contains `sqlIncludes`, or just before
 * the first batch, whichever comes first: a concurrent change that lands
 * between a route's separate reads, or before its single snapshot.
 */
export function interleaveAfterRead(
  sqlIncludes: string,
  change: () => Promise<unknown>,
) {
  let pending: (() => Promise<unknown>) | null = change
  const runOnce = async () => {
    const run = pending
    pending = null
    await run?.()
  }
  // D1 batches only its own statement objects, so unwrap watched ones.
  const unwrapped = new WeakMap<object, D1PreparedStatement>()
  const watch = (statement: D1PreparedStatement): D1PreparedStatement => {
    const watched = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') {
          return (...values: unknown[]) => watch(target.bind(...values))
        }
        if (property === 'first' || property === 'all') {
          return async (...args: unknown[]) => {
            const read = target[property] as (...a: unknown[]) => unknown
            const result = await read.apply(target, args)
            await runOnce()
            return result
          }
        }
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    unwrapped.set(watched, statement)
    return watched
  }
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql)
          return sql.includes(sqlIncludes) ? watch(statement) : statement
        }
      }
      if (property === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          await runOnce()
          return target.batch(
            statements.map(
              (statement) => unwrapped.get(statement) ?? statement,
            ),
          )
        }
      }
      const value: unknown = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return Object.create(env, { DB: { value: db } }) as Env
}
