import { createHash } from 'node:crypto'
import {
  deploymentManifestSchema,
  type DeployPlan,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'
import { buildDeployPlanWithDigest } from './plan-shape.js'

export { canonicalJson } from './canonical.js'

export function manifestDigest(input: unknown) {
  const manifest = deploymentManifestSchema.parse(input)
  return createHash('sha256').update(canonicalJson(manifest)).digest('hex')
}

export function buildDeployPlan(input: unknown): DeployPlan {
  const manifest = deploymentManifestSchema.parse(input)
  return buildDeployPlanWithDigest(manifest, manifestDigest(manifest))
}
