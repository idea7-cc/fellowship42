# ADR 0018: Instance-owned support-session approval

- Status: accepted
- Date: 2026-07-20

## Context

The wire-v1 protocol reserved `support.session.request`, but the instance
correctly rejected it because no local approval record, expiry, revocation, or
owner-visible UI existed. Partner and Fellowship42 support must be useful
without turning a private dashboard role into ambient access to church data or
making the control plane authoritative for local consent.

## Decision

The public instance owns support-session consent in D1. A signed request names
the human operator, purpose, bounded diagnostics scope, request identifier, and
duration. The management grant must require local approval. Creating a request
returns only an awaiting state; a church administrator approves, rejects, or
revokes it through the local application. Approval begins a maximum 120-minute
window, pending requests expire after 24 hours, and local disconnect closes
all current requests.

The protocol change is additive within wire major 1. Existing request fields
remain valid; new clients include an explicit request ID, scope, and human
operator. A client observes state by reissuing the same request ID and exact
input in a new signed command. Any binding drift is rejected.

The first public scope is `operational-diagnostics`. It is evidence that a
private support user may invoke separately granted, privacy-bounded diagnostic
commands during the window. It is not a record-access, export, update,
deployment, billing, or arbitrary execution grant.

## Consequences

- The church can see, approve, expire, and revoke support from inside its own
  instance even if the private dashboard is unavailable.
- The control plane can coordinate support without receiving database or
  infrastructure credentials.
- Every request and local decision has instance audit evidence.
- More invasive scopes require a future additive contract and a separate
  security decision; private policy cannot silently reinterpret this scope.

