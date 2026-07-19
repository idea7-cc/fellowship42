import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'artifacts', 'release')

async function sha256(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

const manifest = JSON.parse(
  await readFile(path.join(outputDirectory, 'release-manifest.json'), 'utf8'),
)

if (manifest.formatVersion !== 1 || !Array.isArray(manifest.artifacts)) {
  throw new Error('Unsupported or malformed release manifest.')
}

for (const artifact of manifest.artifacts) {
  if (path.basename(artifact.file) !== artifact.file) {
    throw new Error(`Artifact paths must be simple filenames: ${artifact.file}`)
  }

  const filePath = path.join(outputDirectory, artifact.file)
  const details = await stat(filePath)
  const digest = await sha256(filePath)

  if (details.size !== artifact.bytes) {
    throw new Error(`Size mismatch for ${artifact.file}.`)
  }
  if (digest !== artifact.sha256) {
    throw new Error(`SHA-256 mismatch for ${artifact.file}.`)
  }
}

const expectedChecksumFiles = [
  ...manifest.artifacts.map(({ file }) => file),
  'release-manifest.json',
].sort()
const expectedChecksumLines = await Promise.all(
  expectedChecksumFiles.map(
    async (file) => `${await sha256(path.join(outputDirectory, file))}  ${file}`,
  ),
)
const actualChecksums = await readFile(path.join(outputDirectory, 'SHA256SUMS'), 'utf8')

if (actualChecksums !== `${expectedChecksumLines.join('\n')}\n`) {
  throw new Error('SHA256SUMS does not match the release manifest and artifacts.')
}

console.log(
  `Verified ${manifest.artifacts.length} release artifacts from ${manifest.source.commit}.`,
)
