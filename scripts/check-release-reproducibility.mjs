import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checksumsPath = path.join(root, 'artifacts', 'release', 'SHA256SUMS')
const first = await readFile(checksumsPath, 'utf8')

execFileSync('node', ['scripts/build-release-artifacts.mjs'], {
  cwd: root,
  stdio: 'inherit',
})
execFileSync('node', ['scripts/verify-release-artifacts.mjs'], {
  cwd: root,
  stdio: 'inherit',
})

const second = await readFile(checksumsPath, 'utf8')
if (second !== first) {
  throw new Error(
    'Release assembly is not reproducible: consecutive SHA256SUMS differ.',
  )
}

console.log('Release assembly is byte-for-byte reproducible across consecutive builds.')
