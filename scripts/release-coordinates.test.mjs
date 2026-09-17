import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

test('release policy, runtime, and migrations declare the same current coordinates', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const json = async (file) =>
    JSON.parse(await readFile(path.join(root, file), 'utf8'))
  const [policy, application, instance, runtime, migrations] =
    await Promise.all([
      json('release-upgrade-policy.json'),
      json('package.json'),
      json('apps/instance/package.json'),
      readFile(path.join(root, 'apps/instance/worker/lib/release.ts'), 'utf8'),
      readdir(path.join(root, 'apps/instance/migrations')),
    ])
  const schemaVersion = Math.max(
    ...migrations
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .map((name) => Number.parseInt(name, 10)),
  )
  assert.equal(policy.target.applicationVersion, application.version)
  assert.equal(instance.version, application.version)
  assert.equal(
    policy.target.schemaVersion,
    schemaVersion,
    'Update the release target when adding a migration',
  )
  assert.equal(
    Number(/export const SCHEMA_VERSION = (\d+)/.exec(runtime)?.[1]),
    schemaVersion,
    'Update the runtime schema coordinate when adding a migration',
  )
})
