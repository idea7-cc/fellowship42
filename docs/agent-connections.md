# Connect your own agent

Fellowship42's early-alpha church MCP endpoint lets a church administrator
connect an external agent, edit a saved website draft, and prepare unpublished
events. Review and publish changes in the church app. No Cloud subscription or
management enrollment is needed.

## Use a connection

1. Open **Agents** in the church app and copy the MCP address.
2. Add that address to a client supporting the MCP **2026-07-28** protocol and
   OAuth. Select the permissions the client needs.
3. Sign in to the church app, check the client identity and permissions, and
   choose **Connect**. Only connect an agent you trust with that information.
4. Ask it to read the draft, save an edit, and open the returned preview link.
   Publish the saved draft from **Settings** when ready.
5. Choose **Disconnect** in **Agents** to stop access immediately. Connections
   also expire after thirty days. Removed permissions and suspended accounts
   stop access even before token expiry.

The instance does not store prompts or conversations. Your chosen agent
receives the authorized content and handles it under its own data policies.

## Tools and scopes

| Scope | Tool | Effect |
|---|---|---|
| `church:read` | `read_church` | Church profile and published ministry content |
| `draft:read` | `read_website_draft` | Saved private draft, readiness, and version |
| `draft:write` | `save_website_draft` | Save the complete draft at that observed version |
| `events:read` | `list_events` | Filtered, paginated church events, including drafts |
| `events:write` | `create_event_draft` | Duplicate-safe creation of an unpublished event |

Request `draft:read` with `draft:write`. A stale version returns
`version_conflict`; read again and reconcile rather than blindly retrying. The
save result includes `previewUrl`, `reviewUrl`, and `publicationChanged: false`.
Only approved tools appear in discovery. There is no publish, member, finance,
media upload, fleet, shell, SQL, or arbitrary fetch tool.

Event scopes require the current `events.write` role permission. Church and
website scopes require `church.write`; a token requesting both requires both. Refresh may narrow an approved token.
Request `events:read` with `events:write`. Follow `page.nextCursor` with the same
filters; each page contains at most 100 events. Reduce `limit` after
`result_too_large`; restart after `invalid_cursor`. Cursors belong to this church.

For event creation, generate one UUID `requestKey` for the approved action and
retain it with the exact event details. If the response is lost, retry that same
key and input. An identical retry returns the existing event with `replayed:
true`; changed input returns `idempotency_conflict`. Never use a new key to retry
an uncertain create. The response contains `reviewUrl` and
`publicationChanged: false`. Review and publish from **Events**. Deduplication is
scoped to the connection, with at most 100 creations per connection. After reconnecting, read existing events and reconcile
before creating again. See [ADR 0025](adr/0025-scoped-agent-event-drafts.md).

## Operator setup

1. Use a separate KV namespace for this instance's OAuth credentials. Create it
   with `pnpm --filter @fellowship42/instance exec wrangler kv namespace create
   OAUTH_KV`, and put its ID in the `OAUTH_KV` binding in `wrangler.jsonc`.
   Keep `global_fetch_strictly_public` enabled for CIMD lookup protection.
2. Set `MCP_ORIGIN` to the canonical HTTPS origin, without a trailing slash,
   such as `https://church.example`. Blank disables the endpoint; the
   `OAUTH_KV` binding may be omitted when disabled. For local
   development use an exact loopback origin and a non-production `ENVIRONMENT`.
   Wrangler's local KV emulation is sufficient locally.
3. Configure [instance-owned staff sign-in](staff-sign-in.md), or retain the
   optional Access adapter. Let `/mcp`, `/oauth/*`, and `/.well-known/oauth-*`
   reach the Worker without an Access login redirect. With passkeys, `/sign-in`
   and `/api/auth/*` must also reach the Worker. The Worker enforces OAuth on `/mcp`, and the consent
   API still requires verified staff identity, permission, and same-origin POST.
   Do not replace human identity with a shared service token.
4. Regenerate bindings with `pnpm cf-typegen`, run `pnpm verify`, and deploy
   through the normal instance process. Lifecycle plans currently cover the
   core application; this optional namespace is a separate operator setup step.
5. Verify an unauthenticated `/mcp` request returns a Bearer challenge, resource
   discovery identifies the exact `/mcp` audience, and consent cannot succeed
   without a signed-in authorized user. Connect, save a draft, disconnect, and
   verify the next tool call and refresh are denied.

The endpoint uses a fresh server per request, with no initialization/session
requirement, legacy protocol fallback, or Durable Object. SDK 2 clients must
opt into modern negotiation, for example:

```ts
new Client({ name: 'church-agent', version: '1.0.0' }, {
  versionNegotiation: { mode: { pin: '2026-07-28' } },
})
```

Dynamically registered client metadata remains until the credential namespace is
reset, so a reused client registration cannot expire underneath a new grant.
This does not extend token or local connection lifetimes.

CIMD and library-managed dynamic registration are supported; S256 PKCE is
required. Tokens are bound to this instance's exact resource. Native/server
clients may omit `Origin`; browser requests are restricted to the configured
same origin. Cross-origin browser clients need a future explicit allowlist.
Do not advertise every client product as tested: repository tests exercise the
official SDK and raw HTTP, not live hosted client accounts.

## Restore or transfer

Keep D1 history and church records, but rotate disposable credentials before
reopening access. Use the supported `f42ctl agents-reset` command in the
[agent operator guide](agent-operator.md). It verifies the portable identity and
empty replacement namespace, revokes connections, clears temporary sign-in
state, and writes a new configuration for review and deployment. No manual SQL
or copying OAuth credentials is required.

Set the destination's canonical origin and reconnect agents with fresh consent.
This is credential rotation, not a dependency on the previous operator. See
[ADR 0023](adr/0023-church-owned-agent-connections.md).

## Client-controlled disconnect

A client can `POST /oauth/disconnect` with its valid OAuth access token in the
`Authorization: Bearer …` header. No body is needed. A `200 {"revoked":true}`
confirms that the instance revoked the D1 connection and audited it; token-store
cleanup follows. A still-valid access token can disconnect after role removal, and never gives
the client access to another connection. Refresh expired access credentials
first when permission remains; after role removal refresh will be denied. A failed
or unauthorized response is inconclusive; clear local credentials and direct
the person to **Agents** if remote disconnect cannot be confirmed.

This resource operation is distinct from provider-only RFC 7009 token revocation.
Reconnecting the same client ID supersedes previous grants for the same local
user and church, including connections from another device. Other clients are
unaffected. See [ADR 0026](adr/0026-client-owned-agent-disconnect.md).

## Verify a client

Use the [interactive client proof](agent-client-proof.md) on a disposable
instance. Reference SDK and independent external-client results are recorded
separately; neither automated tests nor tool discovery alone proves the full
workflow.
