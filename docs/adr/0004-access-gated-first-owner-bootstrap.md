# ADR 0004: Access-gated first-owner bootstrap

- Status: accepted
- Date: 2026-07-19

## Context

A production instance starts with migrated but empty D1 tables. Development
`seed.sql` cannot establish a real church, portable installation identity, or
owner. Cloudflare Access proves an application identity, but an Access policy
may accidentally admit more than the intended first owner. Allowing the first
authenticated visitor to claim an empty deployment would make that policy
mistake an ownership takeover.

Bootstrap also creates records that must agree as one ownership boundary: the
church, profile, singleton instance identity, first active membership, system
roles, owner grant, and audit evidence.

## Decision

The public instance owns an authenticated, one-time bootstrap flow.

1. The Worker validates the Cloudflare Access JWT issuer, audience, signature,
   subject, and email as it does for every application session.
2. The Access email must additionally match the deployment-scoped
   `BOOTSTRAP_OWNER_EMAIL` Worker secret. The expected email is never returned
   to the browser or written to logs.
3. D1 creates the church-owned records, portable `instance_id`, first owner
   membership, system roles, wildcard owner grant, and audit event in one
   transactional batch.
4. The singleton `instance_metadata` constraint makes bootstrap irreversible
   through this endpoint. Later owner changes use normal audited membership
   administration, never bootstrap.
5. The church begins in `draft`. Its authenticated owner can see it; public
   visitors cannot see it until a later publish action.
6. The bootstrap email secret should be deleted after successful setup. It is
   not a portable identifier, management credential, or enduring owner record.
7. Email may activate a deliberately invited user, but it never silently links
   a new Access subject to an already-active account. Active-account identity
   changes require an explicit, audited linking or recovery workflow.

Management enrollment is explicitly outside this flow. Self-hosted and hosted
installations execute the same public bootstrap contract.

## Consequences

- A deployer must configure both Access and the bootstrap owner secret before
  the first owner can initialize production.
- Broad Access admission alone cannot claim an empty instance.
- Bootstrap remains available without Fellowship42 Cloud and produces no
  private control-plane dependency.
- The authenticated identity may be synchronized before the transactional
  instance batch. A losing concurrent claimant can therefore leave an
  unassigned application user, but can never receive a church membership or
  instance ownership grant.
- Changing authentication providers later requires an adapter that preserves
  the same explicit deployment-to-first-owner authorization property.
