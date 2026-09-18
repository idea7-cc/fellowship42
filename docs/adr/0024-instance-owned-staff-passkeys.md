# ADR 0024: Instance-owned staff passkeys

- Status: accepted
- Date: 2026-09-18

## Decision

Staff can sign in with passkeys held by their authenticator. The instance stores
public keys, its own identities, and hashed opaque sessions in D1. SimpleWebAuthn
14 verifies standard WebAuthn signatures, challenges, exact configured origin,
RP ID, and required user verification. We do not implement signature validation.
This is a bounded staff prerequisite to church-owned OAuth consent, not the
member account-claiming portal proposed in ADR 0020. That proposal's Better Auth
choice remains unimplemented; this slice uses the smaller WebAuthn library and
needs no email sender or hosted identity service. Access remains optional.

`SIGN_IN_ORIGIN` pins one HTTPS origin (HTTP localhost only for development).
The RP ID is that origin's hostname, never an arbitrary request Host. Portable
public keys work when restoring the same church domain; a changed domain requires
re-enrollment. An origin change is an operator action, not automatic portability
of passkeys to an unrelated domain.

An operator configures the first owner's email and a cryptographically random
32-byte `BOOTSTRAP_ENROLLMENT_TOKEN`. The token only enrolls that owner on an
unconfigured instance; successful enrollment consumes a persistent marker.
The existing first-owner bootstrap then establishes the church and roles.
Remove both bootstrap secrets after setup. No publicly available signup exists.

For subsequent staff, existing team invitations create the local account and
roles. An owner (the `*` permission, not merely `team.manage`) can issue a
single-use, 24-hour enrollment link for an invited account without an identity.
The owner verifies the recipient and shares the link privately. This is an
owner-delegated account claim, not proof of email control. No email is sent.
A replacement link invalidates the previous one. The instance rechecks target
membership and issuing owner's current authority at acceptance. Suspended,
removed, active/linked, expired and already-consumed targets cannot enroll.

Enrollment capabilities travel in URL fragments, are cleared from visible
history on page mount, and are submitted only in POST bodies. They are never
stored in browser storage or emitted to application logs. D1 stores only their
digests. Five-minute WebAuthn challenges are bound to HttpOnly cookies, consumed
on the first verification attempt, and cannot be replayed to mint sessions.
Registration, identity binding, activation, session issuance and audit share a
conditional D1 batch. Failed or stale authorization creates no success evidence.

Sessions are independent random 256-bit capabilities, hashed in D1, with a fixed
12-hour lifetime, HttpOnly/Secure/host-only/SameSite=Strict cookies, and immediate
server-side logout. The Worker rechecks account status; each API still checks
membership and permissions. Cookie-authenticated writes require exact Origin,
including OAuth consent and management actions. Authentication routes use a
Cloudflare rate-limit binding. Scheduled cleanup removes expired disposable
state. No credentials or user profile content is logged.

## Recovery and custody

Passkey private keys never enter Fellowship42. Encourage a synced passkey or
security key with a backup strategy. An infrastructure-authorized operator can
run `recover-owner.mjs` for an exact active church owner. It revokes that owner's
agent connections, sessions, passkeys and identity links, leaves church records
and roles intact, and writes a single-use ten-minute enrollment link to a new
mode-0600 file. The operator verifies the owner out of band and delivers the
link privately. The operation is audited without the link or email payload.
This deliberately replaces sign-in credentials; it is not an unauthenticated
account-recovery endpoint. Existing infrastructure access already controls D1.

Ordinary staff recovery is deferred; an owner can remove/reinvite with a new
account address or an operator can provide a narrowly reviewed recovery change.
Do not claim general member registration, automated email recovery, or passkey
management UI exists. Supported owner recovery prevents first-owner lockout.
After restore, clear disposable sessions, challenges and enrollment grants, and
reset OAuth credentials as the operator runbook requires. Preserve public-key
identity records when retaining the church domain. No Cloud service is required.

## Validation

Worker tests use a synthetic WebAuthn authenticator with real RSA signatures.
They cover enrollment, signing in, first-owner bootstrap, replay, forgery, origin,
user verification, expiry, revocation and stale authority. DOM tests cover quiet
sign-in errors and safe enrollment handling. These are deterministic tests;
actual browser/authenticator and external-agent proof remain separate evidence.

References: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server),
[passkeys](https://simplewebauthn.dev/docs/advanced/passkeys), and
[Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
