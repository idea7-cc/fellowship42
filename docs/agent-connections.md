# Connect your own agent

Fellowship42's early-alpha church MCP endpoint lets a church administrator
connect an external agent, read church information, and edit a saved website
draft. Review and publish changes in the church app. No Cloud subscription or
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

Request `draft:read` with `draft:write`. A stale version returns
`version_conflict`; read again and reconcile rather than blindly retrying. The
save result includes `previewUrl`, `reviewUrl`, and `publicationChanged: false`.
Only approved tools appear in discovery. There is no publish, member, finance,
media upload, fleet, shell, SQL, or arbitrary fetch tool.

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

Keep the D1 history and church records, but create a fresh OAuth KV namespace at
the destination. Do not copy OAuth credentials. Before reopening access, run in
the restored D1 database:

```sql
DELETE FROM agent_consent_requests;
UPDATE agent_connections
SET revoked_at = COALESCE(revoked_at, unixepoch() * 1000),
    provider_grant_id = NULL;
```

Set the destination's canonical origin and reconnect agents with fresh consent.
This is credential rotation, not a dependency on the previous operator. See
[ADR 0023](adr/0023-church-owned-agent-connections.md).
