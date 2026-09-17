# ADR 0023: Church-owned agent connections

- Status: accepted
- Date: 2026-09-17
- Supersedes: the “any MCP server” placement restriction in ADR 0003

## Context

Churches need to use their own agents for church work without enrolling in a
private management service. Fleet administration and church records have
different principals, permissions, and custody. A token for one must never
confer access to the other. The instance currently authenticates staff through
Access; a future member authentication adapter must resolve the same local user
before consent, rather than becoming the owner of agent grants.

## Decision

The public instance owns a separate church-domain `/mcp` endpoint using SDK 2
and the MCP 2026-07-28 stateless core. The private repository continues to own
the fleet MCP adapter. Neither replaces the versioned HTTPS fleet protocol.

Use `@cloudflare/workers-oauth-provider` for OAuth 2.1 discovery, exact resource
audiences, client metadata/registration, S256 PKCE, token encryption, issuance,
refresh, and credential revocation. Require a configured canonical origin; do
not derive token audiences from arbitrary request hosts. CIMD uses Cloudflare's
`global_fetch_strictly_public` SSRF protection. The library also exposes DCR for
clients using registration. No custom token format or signing protocol is added.

An authenticated local user with `church.write` explicitly consents in the
church app. A ten-minute D1 request binds the verified client, redirect,
challenge, requested scopes, church, and user. Consent needs a same-origin POST
and consumes that request once. Static app headers block framing so consent
cannot be embedded for clickjacking; referrers are suppressed. The token contains a reference to a local
connection, never an Access credential. Access tokens last fifteen minutes;
refresh credentials and local connections are bounded to thirty days.

D1 owns connection grants, scopes, expiry, revocation, and audit. Each tool call
intersects the token's effective scopes with the active local connection and
the consenting user's current active account, membership, and permissions.
The conditional draft write repeats those checks inside its transaction. A
role change or D1 revocation cannot be bypassed by stale KV credentials.

OAuth credential material lives in an instance-local `OAUTH_KV` namespace owned
by the instance operator. It is disposable credential state, not church business
records. KV is eventually consistent; library code redemption/credential cleanup
must not be described as globally linearizable. D1 consent consumption and local
revocation are authoritative. No token, prompt, transcript, or tool response is
stored in audit or ordinary request logs.

The first tools are `read_church`, `read_website_draft`, and
`save_website_draft`. Scope-limited discovery advertises only granted tools. They
use the same church read and draft mutation services as the app. Saves require
an observed version, leave published content unchanged, and atomically write
the existing audit/outbox evidence with user and client attribution. Publishing,
people, giving, media upload, generic HTTP/SQL, and management operations are
outside this surface. Rejected edits create no successful mutation evidence.

## Consequences

- BYOA works independently of Fellowship42 Cloud, commercial accounts, and fleet
  enrollment. Disconnecting management does not revoke or break local agents.
- Consent discloses that the chosen agent receives the authorized church content.
  The church controls this disclosure; Fellowship42 stores no conversation.
- Operators configure the origin, namespace, and path-specific Access rules.
  OAuth discovery/token/MCP routes must reach the Worker; human consent and app
  APIs retain their normal identity checks. An origin-wide Access gate would
  prevent ordinary remote MCP clients from discovering OAuth.
- Exported D1 contains consent history and local connection records. On restore
  or transfer, use a fresh KV namespace, discard pending consent, revoke local
  connections, and reconnect agents. Credential KV is never copied as church
  data. Business records, drafts, and history remain portable.
- The lifecycle CLI does not yet provision this optional credential namespace;
  the operator follows the separate connection setup runbook. It must not claim
  to automatically enable MCP. The core application works with MCP disabled.
- A hosted agent can later use the same public endpoint and consent, with no
  privileged bypass. Its model provider, transcript custody, retention, and
  deletion require a separate decision. This ADR does not authorize that service
  or add it to the public instance.
