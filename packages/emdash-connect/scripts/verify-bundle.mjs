// Builds the registry artifact and checks it offline with the same
// verification EmDash's registry install path runs, plus our own limits.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  computeMultihash,
  validatePluginBundle,
} from '@emdash-cms/registry-verification'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
)
const slug = 'fellowship42-connect'
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/@emdash-cms/plugin-cli/dist/index.mjs'),
    'bundle',
  ],
  { cwd: root, stdio: 'ignore' },
)
const artifact = path.join(root, 'dist', `${slug}-${version}.tar.gz`)
const bytes = new Uint8Array(await readFile(artifact))
const result = await validatePluginBundle(bytes, {
  expectedSlug: slug,
  expectedVersion: version,
})
if (!result.success) {
  console.error(JSON.stringify(result, null, 2))
  throw new Error('Registry bundle failed validation')
}

// Tar entry names from the ustar headers.
const tar = gunzipSync(bytes)
const entries = []
for (let offset = 0; offset + 512 <= tar.length;) {
  const name = tar
    .subarray(offset, offset + 100)
    .toString('utf8')
    .replace(/\0.*$/s, '')
  if (!name) break
  const size = parseInt(
    tar
      .subarray(offset + 124, offset + 136)
      .toString('utf8')
      .trim() || '0',
    8,
  )
  entries.push(name.replace(/^\.\//, ''))
  offset += 512 + Math.ceil(size / 512) * 512
}
const expected = ['README.md', 'backend.js', 'manifest.json']
for (const file of expected.filter((name) => name !== 'README.md'))
  if (!entries.includes(file)) throw new Error(`bundle is missing ${file}`)
const unexpected = entries.filter((name) => !expected.includes(name))
if (unexpected.length) throw new Error(`unexpected bundle files: ${unexpected}`)

const manifest = JSON.parse(
  await readFile(path.join(root, 'dist', 'manifest.json'), 'utf8'),
)
// Network access only: no content, media, user, or email capabilities.
const allowed = new Set(['network:request', 'network:request:unrestricted'])
const declared = manifest.capabilities ?? []
if (declared.some((capability) => !allowed.has(capability)))
  throw new Error(`unexpected capabilities ${JSON.stringify(declared)}`)
if (JSON.stringify(manifest.admin?.portableTextBlocks ?? []) !== '[]')
  throw new Error('a registry bundle cannot carry Portable Text blocks')

console.log(
  JSON.stringify(
    {
      artifact: path.relative(root, artifact),
      bytes: bytes.length,
      multihash: computeMultihash ? await computeMultihash(bytes) : undefined,
      files: entries.sort(),
      validation: 'passed',
    },
    null,
    2,
  ),
)
