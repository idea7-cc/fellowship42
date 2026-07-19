import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
await env.DB.batch(env.TEST_SEED_STATEMENTS.map((statement) => env.DB.prepare(statement)))
