// Local evaluation only: writes a one-time sign-in link for the seeded owner
// (owner@example.test) of the local instance at http://localhost:5173, using
// recover-owner.mjs. Each run writes a new file under .wrangler/owner-links/
// and replaces the previous link. The link opens only this machine's local,
// synthetic instance, so it is also printed. For a real instance, run
// recover-owner.mjs directly as described in docs/staff-sign-in.md.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'http://localhost:5173'
const instance = join(dirname(fileURLToPath(import.meta.url)), '..')
const devVars = join(instance, '.dev.vars')
const configuredOrigin = existsSync(devVars)
  ? readFileSync(devVars, 'utf8').match(
      /^[ \t]*SIGN_IN_ORIGIN[ \t]*=[ \t]*"?([^"\s#]*)/m,
    )?.[1]
  : undefined
if (configuredOrigin !== ORIGIN) {
  console.error(
    `Local passkey sign-in is off. Copy apps/instance/.dev.vars.example to apps/instance/.dev.vars (it sets SIGN_IN_ORIGIN=${ORIGIN}), then restart pnpm dev.`,
  )
  process.exit(1)
}

const directory = join(instance, '.wrangler', 'owner-links')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const output = join(
  directory,
  `owner-link-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
)
const result = spawnSync(
  process.execPath,
  [
    join(instance, 'scripts', 'recover-owner.mjs'),
    '--config',
    'wrangler.jsonc',
    '--database',
    'fellowship42',
    '--origin',
    ORIGIN,
    '--email',
    'owner@example.test',
    '--output',
    output,
    '--local',
    '--confirm-reset-owner',
  ],
  { cwd: instance, stdio: 'inherit' },
)
if (result.status !== 0) {
  console.error(
    'Run `pnpm db:migrate && pnpm db:seed` first; the seeded owner must exist.',
  )
  process.exit(1)
}
console.log(
  `\nOpen this link within ten minutes and create a passkey:\n  ${readFileSync(output, 'utf8').trim()}\n(also saved in ${relative(process.cwd(), output)})`,
)
