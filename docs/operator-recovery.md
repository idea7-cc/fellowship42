# Instance recovery guide

This guide is for a church, self-hosting operator, partner, or compatible
management provider recovering one Fellowship42 deployment. One deployment is
one church's operational and recovery boundary. A Fellowship42 Cloud outage
does not require church-instance recovery: the instance remains independently
useful and local owners retain management revocation, export, and normal church
workflows.

## First classify the failure

| Symptom | Recovery boundary |
|---|---|
| Optional dashboard or management sync is unavailable | Leave the church instance running; operate it locally. |
| Worker code or routing is unavailable but D1/R2 are intact | Restore the exact published application artifact and verify runtime coordinates. |
| An upgrade failed before provider reconciliation | No instance mutation occurred; correct the evidence or preparation and retry. |
| An upgrade failed after migration/reconciliation began | Roll forward to the approved target; do not deploy an older schema. |
| D1 data is damaged but R2 and configuration are intact | Stop writes, preserve evidence, and use an approved D1 recovery point. |
| D1, R2, credentials, or account custody must move | Restore a verified portable export into new, empty resources and use explicit cutover. |
| A management credential may be compromised | Revoke or disconnect locally, then rotate the affected credential class. |

Do not let a control-plane incident expand into a church outage. Never delete
source data, detach domains, restore in place, or reuse old credentials merely
because a remote dashboard recommends it.

## Stabilize and preserve evidence

1. Stop only the affected writes and background work. For a full portable
   capture, use the documented operator-observed quiesce boundary.
2. Record the portable instance ID, exact release tag, release-manifest digest,
   schema version, UTC detection time, and a bounded error code. Do not put
   member, donor, contribution, credential, or raw provider data in tickets or
   logs.
3. Run the public doctor against the current desired-state manifest:

   ```bash
   pnpm f42ctl doctor \
     --manifest ./deployment-manifest.json \
     --runtime https://INSTANCE_HOST
   ```

4. Preserve a verified portable export when the instance can be quiesced. Keep
   the bundle encrypted and church-controlled; only its bounded verification
   evidence belongs in an operational system.

## Recover application code

When D1 and R2 remain authoritative, deploy only an immutable public release
whose checksum and manifest have been verified. The Worker must declare the
same `F42_RELEASE_TAG` and `F42_RELEASE_MANIFEST_SHA256` as the reviewed
deployment manifest. Run `f42ctl doctor` again and verify `/api/health` before
reattaching or changing production routing.

After a migration begins, the supported upgrade policy is roll-forward. The
instance-owned `update.prepare` and `update.apply` records, local approval, and
signed authorization do not grant downgrade authority. See
[Durable instance upgrades](durable-upgrades.md).

## Recover data

Choose the smallest source that actually covers the loss:

- Cloudflare D1 Time Travel can restore recent D1 state to a bookmark or
  timestamp. Cloudflare describes the restore as destructive and in place, and
  returns the previous bookmark for undo. Capture the current bookmark and
  obtain explicit church/operator approval before using it. It does not restore
  R2 objects or portable configuration. See
  [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
- A Fellowship42 portable export covers D1, authorized R2 objects, portable
  configuration, identity, and exact release evidence. Verify it offline, then
  restore to newly created empty resources through the public staged-import
  contract. Rotate deployment, application, and management credentials before
  cutover. See [Portable exports](portable-exports.md) and
  [Portable import and cutover](portable-import-and-cutover.md).

Never treat a D1 recovery point as a complete church backup, and never import a
portable bundle into occupied destination resources. A restored destination is
not production until identity, runtime, health, credential rotation, exact
domains, and church approval all verify.

## Recover management trust

The church owner can revoke grants, rotate the instance management key, or
disconnect management from the local instance UI. Disconnection must not alter
church data or block export. Infrastructure API tokens are a separate trust
domain: revoke or rotate them in the owning Cloudflare account and never send
them through the management protocol.

Reconnect only through a fresh explicit enrollment. Do not accept an old
control-plane record as proof that the instance still grants access.

## Return to service

Before resuming writes or changing routing, retain evidence that:

- the portable instance ID and exact release coordinates match;
- all migrations and health checks pass;
- required R2 objects are present and authorized through D1 metadata;
- application, deployment, and management credentials were rotated when the
  recovery crossed an account or trust boundary;
- a church owner approved the exact cutover when routing changed; and
- the old route is retired without deleting source D1/R2 during the rollback
  window.

If the instance began as a hosted service, request and independently verify its
[exit packet](exit-packets.md). A compatible operator can perform this recovery
with the Apache-2.0 public tools; Fellowship42 Cloud is optional convenience,
not recovery authority.
