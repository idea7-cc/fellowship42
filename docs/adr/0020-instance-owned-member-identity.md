# ADR 0020: Instance-owned member identity

- Status: proposed
- Date: 2026-07-30

## Context

The instance authenticates every user through Cloudflare Access. That is
appropriate for a dozen staff accounts and unworkable for a congregation:
Access is workforce ZTNA, priced per seat beyond a free tier of 50 users, and
it requires every member to exist in an identity provider. A 400-member church
would pay roughly $2,450 per month for the privilege of letting members see
their own giving history.

The product vision commits to a member-facing instance covering "church staff,
ministry leaders, volunteers, members, and the public," so member sign-in is
required rather than optional. Cloudflare publishes no customer-identity
product, so the platform does not answer this for us.

Hosted customer-identity services (Clerk, WorkOS, Auth0) are now inexpensive at
congregation scale and are genuinely good products. They are nonetheless
disqualified as a requirement:

1. `AGENTS.md` invariant 2 requires the instance to be fully useful without
   "any private service." A self-hosting church would need a vendor account to
   let members sign in.
2. The defining promise is that a church can "leave with a working application,
   its identity, and all of its data." If credentials live in a vendor
   directory, the export contains people who cannot sign in, and exit degrades
   to mass re-registration.
3. Member records must remain inside the instance. A hosted directory holding
   the roster moves member data outside the boundary.
4. One instance is one church and one boundary. A vendor tenant per church adds
   an external provider lifecycle to every deployment; a shared tenant would
   let one instance's compromise reach another.

## Decision

Member identity is owned by the instance and stored in its own D1.

**Authentication is adapted; identity is not.** A provider answers exactly one
question — does this person control this email address, passkey, or federated
account — and returns a claim. It never owns the user record.

```ts
interface MemberIdentityProvider {
  start(request): Promise<Challenge>
  verify(request): Promise<{ provider: string; subject: string; email?: string } | null>
}
```

**The instance always mints its own session.** No provider issues the token the
application trusts. This is the pattern the Access path already follows:
`resolveAccessIdentity()` returns a claim and `syncCurrentUser()` creates the
local record. The adapter generalises existing behaviour rather than
introducing a new one.

**Members claim an existing person record; they do not register.** The church
already holds the roster. A claim matches a verified email against `people`,
then binds an `auth_identities` row to that `person_id`. Self-service signup
that creates new people is not offered, because it produces duplicate and
orphan records that staff must reconcile.

**The default provider is Better Auth, self-hosted, in the instance's D1**, and
it is the same default for self-managed and hosted deployments. Credentials are
passwordless first: email link and passkeys. `auth_identities.provider` already
carries `'cloudflare-access'`; this adds `'email-link'` and `'passkey'`.

**Cloudflare Access remains supported for staff** where a deployment configures
it, since privileged accounts benefit from device posture and organisation MFA,
and staff counts sit inside the free tier. Deployments that do not configure
Access use instance-local staff sign-in. Neither is required.

**Member identity and payment processing are never bound to the same
provider.** Convenience bundles that combine authentication with donation
processing are rejected. They would make the bundler merchant of record for
charitable gifts, contradict ADR 0005's instance-owned finance ingress, place
recurring-giving records outside the church's export, and couple the most
business-critical function a church has to authentication vendor churn.

## Consequences

- A self-hosting church runs the member portal with no third-party account.
- Hosted and self-managed churches run the same authentication path, so the
  revenue customers are not the least-tested configuration.
- A portable export contains the identities needed to sign in after a restore,
  so exit stays deterministic.
- Swapping providers is a configuration change, not a data migration, because
  the user model and sessions never left the instance.
- A church that wants its own directory — an existing Entra, Google Workspace,
  or Clerk tenant — can plug it in through the same adapter without a fork.
- The instance stores no member passwords, so the credential-breach surface is
  a session table rather than a password database.
- Better Auth is younger than the hosted alternatives. The risk is bounded
  because it is a library over tables the instance owns; replacing it does not
  move member data.

## Open questions

- Whether the instance should later become a full OAuth provider (OpenAuth or
  `workers-oauth-provider`) so a mobile client, the cloud dashboard's
  church-administrator view, and MCP federate to the instance. Not built now;
  member authentication should be shaped so it can be wrapped later.
- Session lifetime, rotation, and revocation policy for members versus staff.
- Whether a member may hold identities at more than one church instance, and
  what that means for a person who attends two congregations.
- Better Auth issue #4203 (sessions expiring after five minutes on Workers,
  reopened January 2026) must be validated in a spike before implementation
  commits to the library.
