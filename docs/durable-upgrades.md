# Durable instance upgrades

Fellowship42 separates four facts that are often collapsed into one deploy
button: public release compatibility, local instance readiness, church-owner
approval, and infrastructure authority.

## Public sequence

1. An operator selects a published target whose manifest declares the exact
   installed tag, manifest digest, application version, schema version, and
   management wire version as an eligible source.
2. With an explicit `update.prepare` grant, the instance downloads the target
   manifest from its immutable GitHub release URL. It verifies the requested
   SHA-256, strict schema, exact tag, expand-contract strategy, roll-forward
   policy, source eligibility, current D1 migration, runtime readiness, and R2
   availability.
3. The instance stores an expiring preparation and shows its exact source,
   target, and digest in the local owner console.
4. A church owner with `management.admin` types the exact target tag to create
   a 30-minute approval. The `update.apply` grant must itself require local
   approval.
5. `update.apply` consumes that approval once and returns signed public
   authorization evidence. No deployment occurs inside the instance.
6. The infrastructure operator independently verifies required artifact,
   doctor, portable-export, and approval evidence, then uses the public
   reconciliation contract with separately scoped provider credentials.
7. The deployed Worker declares the exact target tag and manifest digest. The
   retained preparation becomes `applied`; post-deploy health evidence proves
   the running application/schema/wire tuple.

Provider implementations should call
`executeAuthorizedUpdateReconciliation` from
`@fellowship42/f42ctl/updates`, not the generic reconciliation executor, for
this path. The wrapper rejects an expired authorization or any mismatch in
portable instance ID, target tag, manifest digest, application/schema tuple, or
wire version before an adapter can cause a provider effect.

Preparations expire after one hour, local approvals after at most 30 minutes,
and apply authorizations after one hour. A new preparation supersedes an older
unapplied preparation. Authorization never means downgrade permission: after a
migration begins, recovery rolls forward. Restoring a verified portable export
is a separate incident operation.

## Deployment coordinates

Every deployed Worker needs these non-secret variables from the reviewed
deployment manifest:

- `F42_RELEASE_TAG`
- `F42_RELEASE_MANIFEST_SHA256`

They are runtime provenance, not mutable release-channel pointers. The
committed Wrangler digest is intentionally a placeholder because a source
archive cannot contain the digest of the release manifest that will later
describe that same archive. Deployment tooling writes the exact values, and
`f42ctl doctor` fails a mismatch.

## Bootstrap boundary

`v0.21.0` introduces this command implementation. Earlier Workers cannot gain
new command behavior from the control plane, even if their enrollment grants
name the reserved capabilities. Upgrade an older instance onto the bootstrap
release through a reviewed public reconciliation operation. Subsequent direct
targets can use the instance-owned preparation and authorization flow when the
target manifest explicitly lists that bootstrap source.
