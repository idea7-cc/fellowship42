import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tag = process.argv[2]
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const instancePackage = JSON.parse(
  await readFile(path.join(root, 'apps', 'instance', 'package.json'), 'utf8'),
)
const expectedTag = `v${rootPackage.version}`

if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  throw new Error(`Release tags must be stable semantic versions such as ${expectedTag}.`)
}
if (tag !== expectedTag) {
  throw new Error(`Tag ${tag} does not match package version ${rootPackage.version}.`)
}
if (rootPackage.version !== instancePackage.version) {
  throw new Error('The root and portable instance application versions must match.')
}

console.log(`Release tag ${tag} matches the portable instance version.`)
