# Church-approved support sessions

Fellowship42 support access is an optional management workflow, not a hidden
administrator account. A compatible operator may send a signed
`support.session.request` command only when the church previously granted that
capability with `requiresLocalApproval: true`. The request itself does not open
a session.

## Request and approval flow

Each request names:

- a stable request identifier;
- the human support operator and display name;
- the purpose shown to the church;
- the public `operational-diagnostics` scope; and
- a requested duration from 5 to 120 minutes.

The instance verifies the signed command, current connection, active grant,
freshness, and replay state, then records it as `awaiting-local-approval` in the
instance D1 database. A local user with `management.admin` can approve or
reject it from the Management page. Pending requests expire after 24 hours.

Approval starts the requested window at approval time; it never backdates the
window to the remote request. The instance displays the active session and its
automatic expiry. The same local page can revoke it immediately. Disconnecting
management rejects pending requests and revokes active sessions as part of the
local disconnect transaction.

The operator learns the current state by repeating the same typed request with
the same request identifier and exact details in a new signed command. A
changed purpose, duration, scope, or support operator fails closed. States are
`awaiting-local-approval`, `approved`, `rejected`, `revoked`, and `expired`.

## Authority boundary

The initial scope permits the private service to authorize its support user to
request the already public, privacy-bounded status and health commands. It does
not grant access to church records, D1, R2 objects, exports, deployment
credentials, updates, billing, or arbitrary commands. Every downstream action
still needs its ordinary instance grant and private assignment authorization.

The public instance remains authoritative for approval, expiry, and revocation.
Private dashboards may mirror signed state for workflow and audit purposes but
cannot extend a window or turn a rejected session into an active one.

## Compatible operators and certification

The public compatible-operator profile proves reproducible software and
protocol behavior. It does not certify a company, person, Cloudflare account,
or live operational practice. A private partner program may bind reviewed
evidence to the public profile, but certification must remain separate from
instance grants and cannot bypass this church approval flow.

See [Compatible operator test inputs](partner-compatibility.md),
[Optional management protocol](management-protocol.md), and
[ADR 0018](adr/0018-instance-owned-support-session-approval.md).

