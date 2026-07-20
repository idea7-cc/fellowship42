import {
  deploymentManifestSchema,
  updateApplyAuthorizationSchema,
  type ReconciliationReport,
  type UpdateApplyAuthorization,
} from '@fellowship42/management-protocol'
import {
  executeDeploymentReconciliation,
  ReconciliationError,
  type DeploymentReconciliationAdapter,
} from './reconciliation.js'

export function releaseCoordinateVariables(manifestInput: unknown): {
  F42_RELEASE_TAG: string
  F42_RELEASE_MANIFEST_SHA256: string
} {
  const manifest = deploymentManifestSchema.parse(manifestInput)
  return {
    F42_RELEASE_TAG: manifest.instance.release.tag,
    F42_RELEASE_MANIFEST_SHA256:
      manifest.instance.release.manifestSha256,
  }
}

export function verifyUpdateDeploymentAuthorization(
  authorizationInput: unknown,
  manifestInput: unknown,
  now = Date.now(),
): UpdateApplyAuthorization {
  const authorization = updateApplyAuthorizationSchema.parse(authorizationInput)
  const manifest = deploymentManifestSchema.parse(manifestInput)
  const target = authorization.target
  const release = manifest.instance.release
  if (
    authorization.instanceId !== manifest.instance.id ||
    target.releaseTag !== release.tag ||
    target.releaseManifestSha256 !== release.manifestSha256 ||
    target.applicationVersion !== release.applicationVersion ||
    target.schemaVersion !== release.schemaVersion ||
    target.managementProtocolWireVersion !==
      release.managementProtocolWireVersion
  ) {
    throw new ReconciliationError(
      'update_authorization_binding_mismatch',
      'The instance authorization does not match the exact deployment target.',
    )
  }
  if (
    Date.parse(authorization.authorizedAt) > now + 5 * 60_000 ||
    Date.parse(authorization.expiresAt) <= now
  ) {
    throw new ReconciliationError(
      'update_authorization_not_current',
      'The instance update authorization is not current.',
    )
  }
  if (
    authorization.source.releaseTag === authorization.target.releaseTag ||
    authorization.source.releaseManifestSha256 ===
      authorization.target.releaseManifestSha256
  ) {
    throw new ReconciliationError(
      'update_authorization_not_an_upgrade',
      'The authorized source and target must be different releases.',
    )
  }
  return authorization
}

export async function executeAuthorizedUpdateReconciliation(options: {
  authorization: unknown
  manifest: unknown
  preview: unknown
  approval: unknown
  adapter: Pick<DeploymentReconciliationAdapter, 'apply'>
  operationId: string
  idempotencyKey: string
  now?: number
  clock?: () => string
}): Promise<ReconciliationReport> {
  verifyUpdateDeploymentAuthorization(
    options.authorization,
    options.manifest,
    options.now,
  )
  return executeDeploymentReconciliation(options)
}
