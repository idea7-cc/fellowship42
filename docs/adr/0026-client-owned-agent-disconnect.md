# ADR 0026: Client-owned disconnect and grant supersession

- Status: Accepted
- Date: 2026-09-18

## Decision

Add `POST /oauth/disconnect` as a public, instance-owned resource operation.
The client presents its ordinary OAuth access token. The reviewed OAuth provider
validates and unwraps it; the instance checks the exact audience and stored
user/client/connection/grant binding. No caller-selected connection ID, staff
cookie, management credential, or refresh-token parsing supplies authority.

The operation atomically revokes that D1 connection and records `agent.revoked`
with client attribution. It also attempts provider grant deletion. D1 denial is
immediate even when KV cleanup is delayed or fails. A still-valid token may
revoke its own grant after local role removal: this grants no data access.

Reconnect with the same client ID supersedes older connections for the same
church and user. Supersession and its audit are atomic with the new connection
insert, and replaced grants do not consume the connection cap. Existing tools
and refresh checks fail closed on superseded D1 authority. Failed or competing
OAuth completions may require reconnecting again; they cannot revive an older
D1 connection. Other client IDs and users are unaffected.

## Consequences

This applies equally to BYOA and optional hosted clients. Native clients using a
stable shared client ID have one active connection per user/church, including
across devices. Users reconnect intentionally; no grant acquires new scopes.

`/oauth/disconnect` complements the provider's standard RFC 7009 endpoint; it is
not advertised as a replacement RFC 7009 endpoint and accepts access tokens
only. Provider-only revocation does not promise D1 bookkeeping. Clients should
refresh an expired access token before calling the instance operation and clear
local credentials regardless of remote success. If success cannot be confirmed,
point the user to **Agents** in the church app. Abandoned grants are superseded
on reconnect and also expire normally.

No fleet or Cloud identity becomes church authority. Disconnect never deletes
church content or audit history. A hosted service remains an ordinary public
OAuth client, and the public instance remains independently useful.
