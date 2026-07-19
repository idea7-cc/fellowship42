import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, rm, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'artifacts', 'release')

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  }).trim()
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

async function sha256(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

const dirtyFiles = run('git', [
  'status',
  '--porcelain=v1',
  '--untracked-files=all',
])
if (dirtyFiles) {
  throw new Error(
    `Release artifacts must be built from a clean commit. Commit or stash these files first:\n${dirtyFiles}`,
  )
}

const [rootPackage, instancePackage, protocolPackage, lifecycleCliPackage] =
  await Promise.all([
    readJson('package.json'),
    readJson('apps/instance/package.json'),
    readJson('packages/management-protocol/package.json'),
    readJson('tooling/f42ctl/package.json'),
  ])

if (rootPackage.version !== instancePackage.version) {
  throw new Error(
    `Application version mismatch: root=${rootPackage.version}, instance=${instancePackage.version}`,
  )
}

const migrationFiles = (
  await readdir(path.join(root, 'apps', 'instance', 'migrations'))
)
  .map((name) => ({ name, match: /^(\d+)_.*\.sql$/.exec(name) }))
  .filter(({ match }) => match)

if (migrationFiles.length === 0) {
  throw new Error('No versioned instance migrations were found.')
}

const schemaVersion = Math.max(
  ...migrationFiles.map(({ match }) => Number.parseInt(match[1], 10)),
)
const commit = run('git', ['rev-parse', 'HEAD'])
const commitTimestamp = run('git', ['show', '-s', '--format=%cI', 'HEAD'])

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

execFileSync(
  'pnpm',
  [
    '--filter',
    protocolPackage.name,
    'pack',
    '--pack-destination',
    outputDirectory,
  ],
  { cwd: root, stdio: 'inherit' },
)

const packedProtocolFiles = (await readdir(outputDirectory)).filter((name) =>
  name.endsWith('.tgz'),
)
if (packedProtocolFiles.length !== 1) {
  throw new Error(
    `Expected one packed management protocol artifact, found ${packedProtocolFiles.length}.`,
  )
}

execFileSync(
  'pnpm',
  [
    '--filter',
    lifecycleCliPackage.name,
    'pack',
    '--pack-destination',
    outputDirectory,
  ],
  { cwd: root, stdio: 'inherit' },
)

const packedLifecycleCliFiles = (await readdir(outputDirectory)).filter(
  (name) => name.endsWith('.tgz') && !packedProtocolFiles.includes(name),
)
if (packedLifecycleCliFiles.length !== 1) {
  throw new Error(
    `Expected one packed lifecycle CLI artifact, found ${packedLifecycleCliFiles.length}.`,
  )
}

const sourceArchiveName = `fellowship42-${rootPackage.version}-source.tgz`
execFileSync(
  'git',
  [
    'archive',
    '--format=tar.gz',
    `--prefix=fellowship42-${rootPackage.version}/`,
    `--output=${path.join(outputDirectory, sourceArchiveName)}`,
    'HEAD',
  ],
  { cwd: root, stdio: 'inherit' },
)

const protocolModule = await import(
  `${pathToFileURL(path.join(root, 'packages', 'management-protocol', 'dist', 'index.js')).href}?commit=${commit}`
)

const artifactDefinitions = [
  { file: sourceArchiveName, kind: 'portable-instance-source' },
  { file: packedProtocolFiles[0], kind: 'management-protocol-package' },
  { file: packedLifecycleCliFiles[0], kind: 'lifecycle-cli-package' },
]

const artifacts = await Promise.all(
  artifactDefinitions.map(async ({ file, kind }) => {
    const filePath = path.join(outputDirectory, file)
    const details = await stat(filePath)
    return {
      file,
      kind,
      bytes: details.size,
      sha256: await sha256(filePath),
    }
  }),
)

const manifest = protocolModule.releaseManifestSchema.parse({
  formatVersion: 1,
  application: {
    name: rootPackage.name,
    version: rootPackage.version,
    schemaVersion,
  },
  managementProtocol: {
    package: protocolPackage.name,
    packageVersion: protocolPackage.version,
    wireVersion: protocolModule.MANAGEMENT_PROTOCOL_VERSION,
  },
  source: {
    repository: 'https://github.com/idea7-cc/fellowship42',
    commit,
    committedAt: commitTimestamp,
  },
  artifacts,
})

const manifestPath = path.join(outputDirectory, 'release-manifest.json')
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const checksumFiles = [
  ...artifacts.map(({ file }) => file),
  'release-manifest.json',
].sort()
const checksumLines = await Promise.all(
  checksumFiles.map(
    async (file) =>
      `${await sha256(path.join(outputDirectory, file))}  ${file}`,
  ),
)
await writeFile(
  path.join(outputDirectory, 'SHA256SUMS'),
  `${checksumLines.join('\n')}\n`,
)

console.log(
  `Built ${artifacts.length} release artifacts for v${rootPackage.version} (${commit}).`,
)
