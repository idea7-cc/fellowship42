# Optional management protocol

## Purpose

The management protocol connects a portable Fellowship42 instance to compatible
management software without making that software a dependency. Fellowship42
Cloud is one implementation; an independent church or partner may implement
another.

The TypeScript, Zod, and Web Crypto contract lives in
`packages/management-protocol`. The instance integration point is
`apps/instance/worker/management`. Enrollment is optional and unavailable until a
local owner configures the wrapping secret and explicitly approves an operator.

## Protocol layers

Keep these layers separate:

1. **Application protocol** — versioned descriptors, capabilities, commands,
   results, export metadata, and error contracts.
2. **Secure transport** — HTTPS, instance/control-plane identity, request
   signing or mutually authenticated transport, expiration, nonces, replay
   rejection, and key rotation.
3. **Infrastructure authorization** — separately scoped Cloudflare authority
   used to create or deploy Workers, D1, R2, domains, and secrets.
4. **MCP adapter** — optional tools/resources for AI-enabled operator clients.

A management credential must never silently become a Cloudflare deployment
credential. An MCP bearer token must never be passed through to an instance or
to the Cloudflare API.

## Connection lifecycle

The intended lifecycle is:

1. A local church administrator enables management. The instance creates an
   Ed25519 key and a random, one-time challenge valid for at most 15 minutes.
2. An operator signs its proposal with its Ed25519 identity. The local owner
   verifies the displayed operator, sync origin, key fingerprint, and requested
   capabilities.
3. The owner approves an explicit, expiring grant set. Empty grants are valid;
   enrollment never implies a capability.
4. The instance signs the approval and initiates synchronization over HTTPS.
5. Signed messages bind message, connection, instance, sender, audience,
   issue/expiry, nonce, and type. Commands also bind typed input and capability.
6. The receiver verifies JWS, identity, freshness, atomic replay state, current
   grant, and local approval before performing an operation.
7. Results and every security-relevant decision are audited on both sides.
8. A local administrator can revoke grants, rotate identity, or disconnect
   without contacting the control plane.

[ADR 0010](adr/0010-management-protocol-v1-security-profile.md) defines the
accepted threat model and stable v1 security profile. It uses HTTPS and standard
flattened JWS with Ed25519 through Web Crypto; it does not add a custom
encryption layer.
[ADR 0011](adr/0011-instance-initiated-management-adapter.md) defines the
implemented instance boundary, encrypted key custody, outbound transport,
retry behavior, and unconditional local disconnect.

## Instance HTTP and sync surfaces

Local application routes use the existing church authorization model:

- `GET /api/management` reads local connection, grant, and sync status;
- `POST /api/management/challenges` creates a 15-minute enrollment challenge;
- `POST /api/management/approve` approves the displayed proposal and grants;
- `POST /api/management/rotate` rotates the instance identity; and
- `POST /api/management/disconnect` disconnects locally and idempotently.

Those routes require `management.admin` (satisfied by the system owner role).
`POST /api/management/proposals` is sessionless because the signed operator
proposal and 256-bit one-use challenge are its authentication. It records a
proposal for review and cannot approve a grant or run a command.

The operator URL is outbound-only. It accepts `{ "jws": <flattened JWS> }` over
HTTPS. Enrollment approvals and key-rotation notices expect any successful
2xx response. A signed `sync.request` expects `{ "jws": <command batch> }`;
the instance then posts a signed command-results envelope. Operators must
deduplicate signed control messages and command results because network
acknowledgment is not transactional with either endpoint's database.

## Wire profile

- wire major: `1`;
- API prefix: `/api/management/v1`;
- security profile: `f42-jws-eddsa-v1`;
- JWS protected header: `alg: EdDSA`, `typ: f42-management+jws`, key ID, and
  wire version;
- signed-message maximum lifetime: five minutes;
- allowed clock skew: 60 seconds;
- replay retention: message expiry plus clock skew;
- maximum batch size: 20 typed commands.

The JWS signing input is the standard base64url protected header, a period, and
the base64url payload. Implementations verify those exact bytes before parsing
the payload. `packages/management-protocol/fixtures/management-jws.v1.json` is
the mandatory public interoperability vector and contains no private key.

## Initial capabilities

The contract reserves these independently grantable capabilities:

- `instance.status.read`
- `instance.health.read`
- `backup.export`
- `update.prepare`
- `update.apply`
- `support.session.request`
- `management.disconnect`

Enrollment grants nothing implicitly. Reading operational status must not imply
access to church records. Preparing an update must not imply authority to apply
it. Support sessions must be time-limited and separately approved.

`update.apply`, `support.session.request`, and `management.disconnect` always
require a fresh local approval reference. Grant replacement is versioned and
atomic; unknown or duplicate capabilities fail closed.

Release 0.21 executes `instance.status.read`, `instance.health.read`,
`update.prepare`, and `update.apply`.
The newer health capability returns the strict public observation described in
[Privacy-bounded instance health](fleet-health.md); it is separate so older
strict status clients remain compatible. Update preparation verifies an exact
immutable public manifest and records local readiness. Update apply consumes a
fresh, exact church-owner approval and returns signed deployment authorization;
the instance never receives infrastructure credentials or performs the deploy.
Recognized backup, support, and disconnect commands receive explicit rejected
results until their separate local workflows are implemented. Empty batches
and empty results are valid heartbeat messages. See
[Durable instance upgrades](durable-upgrades.md).

## Church-owner console

The church-scoped Management page is a local view over the instance adapter; it
does not call or import a private control plane. Only a locally authenticated
member with `management.admin` can open it or use its actions.

The console shows the portable instance identity, encrypted local signing-key
fingerprint, proposed or active operator identity/fingerprint, exact grants and
expirations, local-approval requirements, rotation delivery state, and last
outbound sync result. Enrollment handoffs expose the 256-bit one-use credential
only in the creating browser and warn against logging or durable storage. No
capability is preselected for approval.

Identity rotation requires an explicit typed confirmation and is delivered as
an old-key-authorized message. Local disconnect requires a reason plus a typed
confirmation; it revokes grants and removes local management key material while
leaving church data, normal workflows, and portable export available. After a
disconnect, the owner can download a strict local disposition proving the
active connection, grants, identity/key material, replay state, and command
state are absent while the church record remains available.

## Public adapter conformance

Protocol package `1.3.0` exports
`runManagementAdapterConformance`, a transport-neutral executable suite for an
instance adapter. A harness supplies only the local owner enrollment, sync,
rotation, and disconnect operations; the suite generates ephemeral operator
keys and proves owner-controlled enrollment, a signed granted status command,
byte-identical command replay, local denial of an ungranted command, old-key-
authorized instance rotation, and unconditional local disconnect.

The suite returns a strict, privacy-bounded report containing release versions
and six ordered passing scenario identifiers. It contains no key, challenge,
instance identity, endpoint, command payload, church record, or provider
identifier. Release `v0.17.0` publishes the executed report as
`management-adapter-conformance.v1.json`; CI regenerates it against the real
instance service and sync engine and requires exact equality. This is portable
adapter evidence, not certification of a particular Cloudflare account,
network path, or private management implementation.

## Deployment reconciliation evidence

Protocol package `1.3.0` adds strict schemas for ordered provider observations,
non-destructive previews, digest-bound approvals, normalized adapter outcomes,
and bounded execution reports. These shapes carry portable identity and an
operator-local account alias, but never a provider account ID, resource ID,
credential, or raw provider response.

The provider-neutral execution semantics live in the Worker-safe
`@fellowship42/f42ctl/reconciliation` subpath. Existing resources require
independent ownership verification, blocked previews cannot execute, and every
provider call receives the approved desired fingerprint plus a stable per-step
idempotency key. Provider-specific transport and identifiers remain private to
an injected adapter. See [ADR 0012](adr/0012-provider-neutral-reconciliation-and-scoped-adapters.md).

## Provisioning and first-owner readiness

Protocol package `1.4.0` adds the strict, privacy-bounded instance runtime
health contract used during automated provisioning and first-owner handoff.
It reports a coarse bootstrap state and SHA-256 portable-identity digest, never
the owner selector, owner email, or church records. A missing deployment
identity or mismatch between Worker configuration and D1 is degraded evidence.

## Portable restore conformance

Protocol package `1.5.0` adds the strict `f42-portable-restore-v1` report
schema. The executable runner lives in public `f42ctl` because it needs the
Node filesystem and injected provider restore adapters. It drives real export
assembly, verification, planning, and pre-cutover restore, then emits only
exact release/format versions and nine ordered passing scenario IDs.

The report never carries a portable instance ID, export digest, D1/R2 payload,
object key, domain, provider identifier, credential, or storage location. See
[Portable isolated-restore conformance](portable-restore-conformance.md) and
[ADR 0013](adr/0013-payload-free-isolated-restore-conformance.md).

## Hosted exit evidence

Protocol package `1.6.0` adds strict local management-disposition,
hosted-transfer handoff, exit-packet, and verification-evidence schemas. Public
`f42ctl` binds them to the exact verified export, succeeded import report, and
church-approved cutover by canonical SHA-256. This makes transfer completion
independently rebuildable without provider IDs or secrets. See
[Hosted exit packets](exit-packets.md) and
[ADR 0014](adr/0014-public-verifiable-exit-packet.md).

## Instance health observation

Protocol package `1.7.0` adds the strict format-v1 instance-health observation
and `instance.health.read` command/output pair without changing wire major 1.
The observation carries only portable/release coordinates and bounded
operational states. It has no arbitrary telemetry payload. Unknown metrics are
reported honestly as `unknown`; freshness, backup verification, incidents, and
notifications remain consumer-derived policy. See
[Privacy-bounded instance health](fleet-health.md) and
[ADR 0015](adr/0015-privacy-bounded-instance-health.md).

## Release upgrade eligibility

Protocol package `1.8.0` adds strict exact-source upgrade metadata and a
fail-closed eligibility assessment without changing wire major 1. A target
release names every supported source by tag, manifest digest, application and
schema version, and management wire version. Operators may narrow that public
allowlist through channels and rings but cannot widen it. See
[Releases and immutable artifacts](releases.md) and
[ADR 0016](adr/0016-published-exact-source-upgrade-metadata.md).

Protocol package `1.9.0` adds strict preparation and apply-authorization
evidence without changing wire major 1. The instance binds a one-use local
approval to an exact target and returns signed permission for an external,
separately credentialed reconciler. See
[Durable instance upgrades](durable-upgrades.md) and
[ADR 0017](adr/0017-instance-owned-update-authorization.md).

## Privacy baseline

Routine control-plane status may include:

- portable instance ID;
- application, schema, protocol, and export-format versions;
- binding/resource readiness without account secrets or resource IDs;
- backup freshness and integrity status;
- aggregate request/error health that cannot identify church members.

It must not include member, donor, contribution, attendance, counseling,
pastoral, authentication-token, message, or document contents.

## MCP position

MCP is a useful adapter for an operator to discover instances, read health,
prepare upgrades, request exports, or open approved support workflows. It is not
the instance-to-control-plane durability mechanism.

The MCP server belongs in the private `fellowship42-cloud` repository and calls
the same control-plane application services as the dashboard. Mutating tools
require user confirmation, scoped authorization, and audit records.

## Compatibility

Every descriptor and command carries a wire protocol version. The application
release manifest declares the exact protocol package and wire major it supports.
Unknown messages, fields, commands, capabilities, and profiles are rejected
safely; they are never treated as generic code execution.

Wire v1 is stable. Additive public contracts receive package minor versions;
changes to signature bytes, required fields, capability meaning, or security
rules require a new wire major and parallel API prefix. Package consumers must
pin a published release artifact, verify its checksum, validate the packaged
conformance report, and still test their operator independently.

Protocol changes that affect trust, identity, capability semantics, export, or
backward compatibility require an ADR and contract tests in both repositories.
