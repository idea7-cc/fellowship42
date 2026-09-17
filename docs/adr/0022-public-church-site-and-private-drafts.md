# ADR 0022: Public church website and private profile drafts

- Status: accepted
- Date: 2026-09-16

## Context

A visitor needs to see a church's published information without entering the
staff application. Owners need to prepare a profile without immediately
changing what visitors see. Both surfaces must remain useful in a standalone,
church-owned deployment.

## Decision

Serve the public church website at `/` and public course pages at
`/courses/:slug`. Move the staff workspace to `/app`, including owner settings
and private preview. Session and bootstrap queries run only on the staff
surface. Cloudflare Access remains the staff identity adapter; this decision
does not implement or accept the proposed member-authentication design.

The Worker authorizes each settings and preview request with `church.write`.
A saved draft is private D1 data. Publishing atomically applies that draft,
marks the church published, makes selected images public, and records audit
and outbox evidence. Conditional church-version writes reject stale requests
without recording success. Public readers receive only published fields.

Ministry records and media keep their existing independent publication
lifecycles. Unpublishing a church hides the website but does not revoke public
media URLs. Published profile image references prevent media deletion or
privatization until the reference is removed or the church unpublished.

## Consequences

Operators must allow anonymous delivery of public pages, published APIs,
assets, and public media while protecting staff paths with the configured
Access application. Worker authorization remains authoritative. No separate
service, Cloud dependency, credential, or ownership boundary is introduced.

The staff route move and initial-schema edit are intentional breaking changes
under the pre-alpha policy. No redirects or migration compatibility layer are
provided. See [the publishing workflow](../church-setup-and-publishing.md).
