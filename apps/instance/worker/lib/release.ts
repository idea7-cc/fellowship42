import {
  releaseUpgradeSourceSchema,
  type ReleaseUpgradeSource,
} from '@fellowship42/management-protocol'
import instancePackage from '../../package.json'
import { AppError } from './errors'

export const APPLICATION_VERSION = instancePackage.version
export const SCHEMA_VERSION = 7

export type ReleaseCoordinateBindings = {
  F42_RELEASE_TAG?: string
  F42_RELEASE_MANIFEST_SHA256?: string
}

export function currentReleaseSource(
  env: ReleaseCoordinateBindings,
): ReleaseUpgradeSource {
  const parsed = releaseUpgradeSourceSchema.safeParse({
    releaseTag: env.F42_RELEASE_TAG?.trim(),
    releaseManifestSha256: env.F42_RELEASE_MANIFEST_SHA256?.trim(),
    applicationVersion: APPLICATION_VERSION,
    schemaVersion: SCHEMA_VERSION,
    managementProtocolWireVersion: '1',
  })
  if (
    !parsed.success ||
    parsed.data.releaseManifestSha256 === '0'.repeat(64)
  ) {
    throw new AppError(
      503,
      'release_coordinates_not_configured',
      'This deployment does not declare its exact release manifest coordinates',
    )
  }
  return parsed.data
}
