import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import {
  deploymentManifestSchema,
  exportEvidenceSchema,
  portableConfigurationSchema,
  portableExportManifestSchema,
  r2ExportIndexSchema,
  type ExportEvidence,
  type PortableExportManifest,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'

const MANIFEST_FILE = 'export-manifest.json'
const MAX_JSON_BYTES = 16 * 1024 * 1024

type SourceObject = { key: string; file: string }

export interface AssembleExportOptions {
  deploymentManifestPath: string
  d1ExportPath: string
  r2SourceIndexPath: string
  r2SourceRoot: string
  outputDirectory: string
  quiescedAt: string
  exportedAt?: string
}

function safeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1_024 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
}

async function readBoundedJson(file: string): Promise<unknown> {
  const details = await lstat(file)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Expected a regular JSON file: ${file}`)
  }
  if (details.size > MAX_JSON_BYTES) throw new Error(`JSON file is too large: ${file}`)
  return JSON.parse(await readFile(file, 'utf8'))
}

function sourceObjects(input: unknown): SourceObject[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('R2 source index must be an object')
  }
  const record = input as Record<string, unknown>
  if (
    Object.keys(record).sort().join(',') !== 'formatVersion,objects' ||
    record.formatVersion !== 1 ||
    !Array.isArray(record.objects)
  ) {
    throw new Error('R2 source index has an unsupported shape')
  }
  const keys = new Set<string>()
  return record.objects.map((value, position) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`R2 source object ${position} must be an object`)
    }
    const object = value as Record<string, unknown>
    if (
      Object.keys(object).sort().join(',') !== 'file,key' ||
      typeof object.key !== 'string' ||
      object.key.length === 0 ||
      object.key.length > 1_024 ||
      /[\u0000-\u001f\u007f]/.test(object.key) ||
      !safeRelativePath(object.file)
    ) {
      throw new Error(`R2 source object ${position} is invalid`)
    }
    if (keys.has(object.key)) throw new Error(`Duplicate R2 object key: ${object.key}`)
    keys.add(object.key)
    return { key: object.key, file: object.file }
  })
}

async function digest(file: string) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(file)) {
    const buffer = chunk as Buffer
    bytes += buffer.byteLength
    hash.update(buffer)
  }
  return { bytes, sha256: hash.digest('hex') }
}

async function regularFile(file: string) {
  const details = await lstat(file)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Expected a regular file: ${file}`)
  }
}

function within(root: string, relative: string) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relative)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path leaves its source root: ${relative}`)
  }
  return resolved
}

async function writeJson(file: string, value: unknown) {
  await writeFile(file, `${canonicalJson(value)}\n`, { flag: 'wx' })
}

async function containsText(file: string, expected: string) {
  let carry = ''
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    const text = carry + chunk
    if (text.includes(expected)) return true
    carry = text.slice(-Math.max(expected.length - 1, 0))
  }
  return false
}

async function copyArtifact(source: string, destination: string) {
  await regularFile(source)
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination, 1)
  return digest(destination)
}

export async function assemblePortableExport(
  options: AssembleExportOptions,
): Promise<PortableExportManifest> {
  const deployment = deploymentManifestSchema.parse(
    await readBoundedJson(options.deploymentManifestPath),
  )
  const quiescedAt = new Date(options.quiescedAt)
  const exportedAt = new Date(options.exportedAt ?? new Date().toISOString())
  if (
    Number.isNaN(quiescedAt.valueOf()) ||
    Number.isNaN(exportedAt.valueOf()) ||
    exportedAt < quiescedAt
  ) {
    throw new Error('Export timestamps must be valid and export must follow quiesce')
  }
  await regularFile(options.d1ExportPath)
  if (
    !(await containsText(options.d1ExportPath, 'instance_metadata')) ||
    !(await containsText(options.d1ExportPath, deployment.instance.id))
  ) {
    throw new Error('D1 export does not bind the declared portable instance identity')
  }
  const objects = sourceObjects(await readBoundedJson(options.r2SourceIndexPath))
  const output = path.resolve(options.outputDirectory)
  try {
    await lstat(output)
    throw new Error(`Output already exists: ${output}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temporary = `${output}.partial-${randomUUID()}`
  await mkdir(temporary, { recursive: false })
  try {
    const d1 = await copyArtifact(options.d1ExportPath, path.join(temporary, 'd1/database.sql'))
    const config = portableConfigurationSchema.parse({
      formatVersion: 1,
      instanceId: deployment.instance.id,
      settings: {
        paymentWebhookProvider: deployment.configuration.paymentWebhookProvider,
      },
    })
    await mkdir(path.join(temporary, 'config'), { recursive: true })
    await writeJson(path.join(temporary, 'config/portable.json'), config)
    const configuration = await digest(path.join(temporary, 'config/portable.json'))

    const indexedObjects = []
    for (const object of objects.sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    )) {
      const source = within(options.r2SourceRoot, object.file)
      await regularFile(source)
      const sourceDigest = await digest(source)
      const relative = `r2/objects/${sourceDigest.sha256}`
      const destination = path.join(temporary, relative)
      try {
        await regularFile(destination)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await mkdir(path.dirname(destination), { recursive: true })
        await copyFile(source, destination, 1)
      }
      indexedObjects.push({ key: object.key, file: relative, ...sourceDigest })
    }
    const r2Index = r2ExportIndexSchema.parse({ formatVersion: 1, objects: indexedObjects })
    await mkdir(path.join(temporary, 'r2'), { recursive: true })
    await writeJson(path.join(temporary, 'r2/index.json'), r2Index)
    const index = await digest(path.join(temporary, 'r2/index.json'))

    const manifest = portableExportManifestSchema.parse({
      formatVersion: 1,
      instanceId: deployment.instance.id,
      sourceRelease: deployment.instance.release,
      exportedAt: exportedAt.toISOString(),
      consistency: { mode: 'operator-quiesced', quiescedAt: quiescedAt.toISOString() },
      artifacts: [
        { kind: 'd1-sql', file: 'd1/database.sql', ...d1 },
        { kind: 'portable-configuration', file: 'config/portable.json', ...configuration },
        { kind: 'r2-index', file: 'r2/index.json', ...index },
      ],
    })
    await writeJson(path.join(temporary, MANIFEST_FILE), manifest)
    await mkdir(output, { recursive: false })
    await rename(temporary, output)
    return manifest
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    try {
      await rmdir(output)
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Preserve a non-empty or otherwise changed target rather than deleting it.
      }
    }
    throw error
  }
}

async function allFiles(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative)
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) throw new Error(`Export bundle contains a symbolic link: ${child}`)
    if (entry.isDirectory()) files.push(...(await allFiles(root, child)))
    else if (entry.isFile()) files.push(child)
    else throw new Error(`Export bundle contains an unsupported entry: ${child}`)
  }
  return files.sort()
}

export async function verifyPortableExport(options: {
  directory: string
  verifiedAt?: string
  evidenceId?: string
}): Promise<ExportEvidence> {
  const root = path.resolve(options.directory)
  const rootDetails = await lstat(root)
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
    throw new Error('Export bundle root must be a regular directory')
  }
  const manifestPath = path.join(root, MANIFEST_FILE)
  const manifest = portableExportManifestSchema.parse(await readBoundedJson(manifestPath))
  for (const artifact of manifest.artifacts) {
    const file = within(root, artifact.file)
    await regularFile(file)
    const actual = await digest(file)
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) {
      throw new Error(`Export artifact verification failed: ${artifact.file}`)
    }
  }
  const configuration = portableConfigurationSchema.parse(
    await readBoundedJson(path.join(root, 'config/portable.json')),
  )
  if (configuration.instanceId !== manifest.instanceId) {
    throw new Error('Portable configuration instance identity does not match manifest')
  }
  if (
    !(await containsText(path.join(root, 'd1/database.sql'), 'instance_metadata')) ||
    !(await containsText(path.join(root, 'd1/database.sql'), manifest.instanceId))
  ) {
    throw new Error('D1 artifact does not bind the manifest portable identity')
  }
  const r2Index = r2ExportIndexSchema.parse(
    await readBoundedJson(path.join(root, 'r2/index.json')),
  )
  for (const object of r2Index.objects) {
    const actual = await digest(within(root, object.file))
    if (actual.bytes !== object.bytes || actual.sha256 !== object.sha256) {
      throw new Error(`R2 object verification failed for key: ${object.key}`)
    }
  }
  const expected = new Set([
    MANIFEST_FILE,
    ...manifest.artifacts.map((artifact) => artifact.file),
    ...r2Index.objects.map((object) => object.file),
  ])
  const files = await allFiles(root)
  if (files.length !== expected.size || files.some((file) => !expected.has(file))) {
    throw new Error('Export bundle contains missing, unreferenced, or duplicate-path files')
  }
  const verifiedAt = new Date(options.verifiedAt ?? new Date().toISOString())
  if (Number.isNaN(verifiedAt.valueOf()) || verifiedAt < new Date(manifest.exportedAt)) {
    throw new Error('Verification timestamp must be valid and follow export')
  }
  const manifestDigest = await digest(manifestPath)
  return exportEvidenceSchema.parse({
    formatVersion: 1,
    evidenceId: options.evidenceId ?? randomUUID(),
    instanceId: manifest.instanceId,
    sourceApplicationVersion: manifest.sourceRelease.applicationVersion,
    sourceSchemaVersion: manifest.sourceRelease.schemaVersion,
    sourceManagementProtocolPackageVersion:
      manifest.sourceRelease.managementProtocolPackageVersion,
    exportManifestSha256: manifestDigest.sha256,
    exportedAt: manifest.exportedAt,
    verifiedAt: verifiedAt.toISOString(),
    consistencyMode: manifest.consistency.mode,
    verificationStatus: 'verified',
  })
}
