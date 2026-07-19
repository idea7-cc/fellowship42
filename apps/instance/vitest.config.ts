import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const seedSql = await readFile(path.join(directory, 'seed.sql'), 'utf8')
      const seedStatements = seedSql
        .split(/;\s*(?:\n|$)/)
        .map((statement) => statement.trim())
        .filter(
          (statement) =>
            statement.length > 0 && !statement.startsWith('PRAGMA '),
        )

      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(
              path.join(directory, 'migrations'),
            ),
            TEST_SEED_STATEMENTS: seedStatements,
            PAYMENT_WEBHOOK_PROVIDER: 'testpay',
            PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-at-least-32-bytes',
          },
        },
      }
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
})
