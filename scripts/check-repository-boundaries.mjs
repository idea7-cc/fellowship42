import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'fellowship42.repository.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const errors = []

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function sourceFiles(relativePath) {
  const absolutePath = path.join(root, relativePath)
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (['dist', 'node_modules', '.wrangler'].includes(entry.name)) continue
    const child = path.join(relativePath, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(child)))
    if (entry.isFile() && /\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) files.push(child)
  }

  return files
}

if (manifest.repositoryType !== 'public-portable-instance') {
  errors.push('repositoryType must remain public-portable-instance')
}

const requiredPaths = [
  manifest.deployableInstance,
  manifest.projectSite,
  ...manifest.publicContracts,
  ...manifest.publicSharedPackages,
  ...manifest.plannedPortableTooling,
  ...Object.values(manifest.releaseContract),
]

for (const requiredPath of requiredPaths) {
  if (!(await exists(requiredPath))) errors.push(`required public path is missing: ${requiredPath}`)
}

for (const forbiddenPath of manifest.forbiddenPrivatePaths) {
  if (await exists(forbiddenPath)) {
    errors.push(`private hosted-service code must live in ${manifest.privateRepository}: ${forbiddenPath}`)
  }
}

const scannedRoots = [manifest.deployableInstance, ...manifest.publicContracts]
for (const scannedRoot of scannedRoots) {
  for (const file of await sourceFiles(scannedRoot)) {
    const source = await readFile(path.join(root, file), 'utf8')
    for (const forbiddenImport of manifest.forbiddenPrivateImports) {
      if (source.includes(forbiddenImport)) {
        errors.push(`${file} imports private surface ${forbiddenImport}`)
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Repository boundaries are valid.')
}
