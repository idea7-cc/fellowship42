import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inspectImportBoundaries } from './import-boundaries.mjs'

async function fixture(t, entries) {
  const root = await mkdtemp(path.join(tmpdir(), 'f42-import-boundaries-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [name, content] of Object.entries(entries)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), content)
  }
  return root
}
test('rejects package-to-app imports, including tsconfig aliases', async (t) => {
  const root = await fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@app/*': ['apps/instance/worker/*'] },
      },
    }),
    'apps/instance/worker/service.ts': 'export const service = 1',
    'packages/management-protocol/src/index.ts':
      "import { service } from '@app/service'; export { service }",
  })
  assert.match(
    (await inspectImportBoundaries(root, 'public')).join('\n'),
    /forbidden dependency on apps\/instance/,
  )
})
test('rejects frontend-to-worker and repository escape imports', async (t) => {
  const root = await fixture(t, {
    'apps/instance/src/index.ts':
      "import '../worker/service'; import '../../../../fellowship42-cloud/apps/control-plane/src/index'",
    'apps/instance/worker/service.ts': 'export const service = 1',
  })
  const errors = (await inspectImportBoundaries(root, 'public')).join('\n')
  assert.match(errors, /browser imports server/)
  assert.match(errors, /import escapes the repository/)
})
test('detects runtime cycles but allows type-only relationships', async (t) => {
  const root = await fixture(t, {
    'apps/instance/src/a.ts': "import './b'; export type A = string",
    'apps/instance/src/b.ts': "import './a'",
  })
  assert.match(
    (await inspectImportBoundaries(root, 'public')).join('\n'),
    /runtime import cycle/,
  )
  await writeFile(
    path.join(root, 'apps/instance/src/b.ts'),
    "import type { A } from './a'; export type B = A",
  )
  assert.deepEqual(await inspectImportBoundaries(root, 'public'), [])
})
test('allows public packages only through the private management client', async (t) => {
  const root = await fixture(t, {
    'packages/mcp-adapter/src/index.ts':
      "export * from '@fellowship42/management-protocol'",
    'packages/management-client/src/index.ts':
      "export * from '@fellowship42/management-protocol'",
  })
  const errors = await inspectImportBoundaries(root, 'private')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /mcp-adapter/)
})

test('rejects runtime-specific contracts and inline import types across boundaries', async (t) => {
  const root = await fixture(t, {
    'apps/instance/contracts/api.ts':
      "export type Payload = import('../worker/service').Payload",
    'apps/instance/worker/service.ts': 'export type Payload = string',
    'packages/brand/src/index.ts':
      "export type Payload = import('../../../apps/instance/worker/service').Payload",
  })
  const errors = await inspectImportBoundaries(root, 'public')
  assert.ok(
    errors.some((error) => error.includes('neutral contract imports Worker')),
  )
  assert.ok(
    errors.some((error) =>
      error.includes('forbidden dependency on apps/instance'),
    ),
  )
})
