# ADR 0027: EmDash church websites and the public website contract

- Status: accepted
- Date: 2026-09-30
- Amends: ADR 0022 (the instance homepage is no longer the default website)

## Context

Churches need an editorial website: pages, articles, navigation, and a
presentation they can change without code. Fellowship42 already owns the
church's authoritative records (profile, service times, events, sermons,
groups, and courses) and must remain the only place those records are edited.
EmDash 1.0.1 is an open, Astro-based CMS that runs on Cloudflare with D1 and
R2. A church may start from Fellowship42 or from an EmDash site it already
operates. Both paths must show the same church content through the same
contract, without Fellowship42 Cloud, Core7web, or a managed service.

EmDash 1.0.1 constrains the design (verified against the 1.0.1 source):

- Portable Text block types and their Astro renderers can only come from a
  native plugin installed as a trusted npm package and registered in
  `astro.config.mjs`. The EmDash registry distributes only sandboxed plugins,
  which cannot declare blocks, ship components, or use service bindings.
- Plugin HTTP from `ctx.http` refuses loopback, private, and several
  wildcard-DNS hosts in every mode, so it cannot reach a local instance.
- EmDash's first-admin setup is first-come until an administrator exists.
- EmDash and the instance both create `media` and `users` tables, so they cannot
  share a D1 database.

## Decision

**Topology.** A Fellowship42-first installation contains two Workers inside one
church-owned installation boundary: the existing instance Worker and an EmDash
website Worker (`apps/website`) with its own D1 database, R2 bucket, and
disposable session KV. They use separate hostnames. The website is a component
of the installation, not a second installation: `instance_metadata` remains the
only portable identity, and the lifecycle manifest, export, restore plan, and
exit inventory list the website's resources beside the instance's. Both Workers
are deployed by the same deployment authority. Connecting church content never
moves hosting control.

**One authority per kind of content.** D1 in the instance is authoritative for
the church profile, service times, events, sermons, groups, courses, and their
media. EmDash is authoritative for pages, articles, menus, and presentation.
The website stores no copy of church records. It renders them at request time
from the public contract and caches nothing beyond the request. On the
installation's website, the church name, tagline, and logo also come from the
profile; EmDash's site title, tagline, and logo are only a fallback while church
information is unavailable or unpublished.

**Public website contract v1.** The instance serves anonymous `GET` routes under
`/api/website/v1`. They:

- never read the caller's identity;
- return only published records and an explicit field allowlist;
- page every list with an opaque keyset cursor and a caller-chosen limit (at
  most 100), with no silent truncation;
- return absolute URLs, ISO 8601 UTC instants with IANA time zones, and
  calendar dates for sermons;
- send `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`, and
  `Cross-Origin-Resource-Policy: cross-origin`, and never send credentials.

The descriptor route names the contract and version and publishes the portable
identity digest already exposed by instance health. Clients refuse other
contracts or major versions and report the mismatch. Public `/media/*` responses
also allow cross-origin embedding. Types, parsers, and a runtime-neutral client
are published as `@fellowship42/website-contract`.

**Integration packaging.**

- `@fellowship42/emdash` is the complete integration. It is a native, trusted
  npm plugin that provides the connection, Portable Text blocks, Astro
  renderers, an editor-facing status page, and structured data.
- `fellowship42-connect` is a sandboxed registry artifact. It provides the
  connection, public data routes, the status page, and structured data, but no
  blocks.

Both setup paths install the same npm integration. The registry artifact exists
for sites that install from the registry. Its documentation states that church
blocks require the trusted package, because the registry cannot carry them.

**Connection authority.** The website connects with the public contract only;
there is no privileged connection or shared credential. Deployment environment
variables pin the connection:

- `FELLOWSHIP42_URL` pins the address; when it is set, plugin settings are not
  read;
- `FELLOWSHIP42_INSTANCE_SHA256` pins the identity whenever it is set, even
  when the address comes from plugin settings;
- an optional `FELLOWSHIP42` service binding, when both Workers share an
  account, carries requests only for an address pinned by `FELLOWSHIP42_URL`.

When the address is not pinned, it comes from plugin settings, which only an
EmDash Administrator can change. The trusted plugin fetches from the site's
server without the sandbox's network limits, so a settings address must name
a public host: loopback, private, link-local, carrier-grade NAT, unspecified,
and local-only names (`localhost`, `*.localhost`, `*.local`, `*.internal`) are
refused unless the deployment sets `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` for
local evaluation or the site runs under `astro dev`. A pinned address is
trusted as given. A digest mismatch is a deliberate "different church" state,
not a fallback, and a pin that is not a 64-character hex digest is reported as
its own state.

**Editor sign-in.** Website editors use EmDash's own accounts: passkeys and
invitations, with EmDash roles. An EmDash account confers no Fellowship42
finance, directory, or fleet access. A Fellowship42 owner claims the first
EmDash administrator:

1. The website refuses EmDash's setup routes until the browser presents a
   ten-minute, audience-bound claim.
2. The instance mints that claim for an owner, signed with an HMAC over the
   installation's `WEBSITE_SETUP_SECRET`. Both Workers hold that secret, and it
   is removed after setup.
3. Setup then continues with EmDash's own passkey flow.

EmDash's OAuth sign-in makes the first OAuth user an administrator, so while
`WEBSITE_SETUP_SECRET` is configured the website also refuses EmDash's OAuth
start routes. OAuth sign-in is enabled only after the first administrator
exists and the secret is removed. Seamless single sign-on is deferred.

**Instance homepage.** When `WEBSITE_ORIGIN` is configured, the instance's `/`
redirects to the website. Public course detail pages and public media remain on
the instance. Without a configured website, the existing instance homepage stays
available.

## Consequences

- Withdrawing or deleting a record removes it from every website on the next
  request. An unreachable or incompatible instance renders an explicit
  unavailable state rather than stale content. Public media keeps its own
  documented visibility lifecycle.
- Website editors are managed in EmDash. Disabling an EmDash user ends access on
  the next request. Removing a Fellowship42 owner stops new setup claims.
- `EMDASH_ENCRYPTION_KEY` is an application secret that must be preserved for
  migration. `WEBSITE_SETUP_SECRET` is deleted after setup. Session KV is
  disposable, like the OAuth KV.
- EmDash site transfer does not carry plugin settings. The deployment pin, or a
  re-entered setting, restores the connection.
- A church running an independent EmDash site retains its own ownership,
  backups, and upgrades. Fellowship42 lifecycle tooling covers only the
  installation it generated.
- Pre-alpha policy applies: no compatibility routes are added for the previous
  homepage.
