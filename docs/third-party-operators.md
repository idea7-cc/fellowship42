# Operating Fellowship42 for another church

Fellowship42 permits independent hosting and professional operation under
Apache-2.0. An operator is not required to use Fellowship42 Cloud. Each church
must still receive one independent, portable instance and a documented exit.

## Required operating shape

One church deployment has its own Worker, D1 database, R2 bucket, Durable Object
namespace, outbox Queue, dead-letter Queue, portable instance identity, Access
policy, secrets, release coordinates, backup boundary, and migration record.
Do not place multiple churches in one application database or use a provider
resource ID as the portable identity.

The strongest custody mode is a dedicated church-owned Cloudflare account with
least-privilege operator access. A partner-owned account can reduce onboarding
friction, but the agreement and operating process must preserve verified export,
fresh-destination restore, credential rotation, domain cutover, management
disposition, and source retirement.

## Before production

1. Verify an immutable tagged release and its `SHA256SUMS` and release manifest.
2. Run the public partner-compatibility inputs. Treat them as software evidence,
   not live-provider or human certification.
3. Review the deterministic deployment manifest and reconciliation preview.
4. Use a credential scoped to the intended account and resources; keep it out
   of manifests, evidence, logs, browser state, and the church instance.
5. Configure and test Access, first-owner bootstrap, Queue delivery, R2
   authorization, runtime health, export, isolated restore, and incident
   recovery with synthetic data.
6. Record the infrastructure owner, operator, release, backup/restore policy,
   support path, subcontractors, data locations, and exit procedure for the
   church.

The manual Wrangler flow is documented in [deployment](deployment.md). An
automation system must consume the public reconciliation contract through its
own scoped provider adapter; it must not fork lifecycle semantics or use an
unpublished checkout.

## Optional management

Enrollment is separate from deployment and requires church-local approval.
Grant only the capabilities needed. The instance initiates durable HTTPS sync,
and the church can inspect grants, rotate local identity, revoke support, or
disconnect management. MCP may be offered by an operator's private client, but
it is not the control-plane-to-instance protocol and grants no additional
instance authority.

## Ongoing operation

- Monitor coarse, privacy-bounded health without copying church records.
- Verify encrypted portable exports and exercise isolated restoration on a
  declared schedule before making recovery claims.
- Upgrade only from exact eligible sources, after a recovery export and the
  church's local preparation/approval.
- Preserve audit evidence without secrets or record payloads.
- Re-run compatibility after every supported release and after material
  provider, security, or recovery-process changes.

## Exit and handoff

The church chooses its next operator or self-hosting account. Follow
[portable export](portable-exports.md),
[import and cutover](portable-import-and-cutover.md), and
[exit packet](exit-packets.md). Do not revoke the source or delete recovery
material before destination acceptance and the agreed rollback window. Deliver
the verified packet and explain any remaining risks in plain language.

## Representation

Compatibility does not imply endorsement or certification. Follow
[the trademark policy](../TRADEMARKS.md), identify the actual operator, and do
not claim official or certified status without separate written authorization.
