# EmDash church websites

A church's public website is an [EmDash](https://github.com/emdash-cms/emdash)
site. EmDash owns pages, articles, menus, and presentation. Fellowship42 owns
the church's records and shows them on the website through the
[public website contract](website-contract.md). There are two ways to start;
both use the same integration and render the same records.

| | Fellowship42 first | EmDash first |
| --- | --- | --- |
| Website | `apps/website`, deployed beside the instance in the same church-owned installation | An EmDash site the church already operates |
| Integration | Preinstalled: `@fellowship42/emdash` | The church's developer adds `@fellowship42/emdash` (and optionally the `fellowship42-connect` registry connector) |
| Connection | Pinned by the website deployment (`FELLOWSHIP42_URL`, `FELLOWSHIP42_INSTANCE_SHA256`) | Set by an EmDash Administrator in plugin settings, or pinned the same way |
| First editor | A Fellowship42 owner claims the website's first administrator | The site's existing administrators |
| Needs | Nothing beyond the installation | Neither Fellowship42 Cloud, Core7web, nor a managed service |

The decision is recorded in [ADR 0027](adr/0027-emdash-church-websites.md).

## Where each kind of content is edited

| Content | Edited in | Made public by |
| --- | --- | --- |
| Pages, articles, menus, and site design | EmDash (`/_emdash/admin`) | Publishing the page or article. Drafts and previews stay private. |
| Church name, welcome line (tagline), logo, profile, address, contact, and service times | Fellowship42 **Settings** | Publishing the church in Settings |
| Events, sermons, groups, and courses | Fellowship42 | Publishing each record there |

The website stores no copy of church records. A church block in a page stores
only display choices (heading, number of items, paging). Each page load reads
the currently published records, so a withdrawn or deleted record disappears
from every website on the next visit. When Fellowship42 cannot be reached, or
the connection points at another church or an incompatible version, blocks show
a plain "temporarily unavailable" notice. They never show stale content. Both
Fellowship42 Settings and the EmDash **Fellowship42** admin page state these
rules. That promise holds only while pages with church content are rendered on
demand and never cached; see [Caching](#caching).

## Church blocks

The editor's slash menu has a **Church (Fellowship42)** section:

| Block | Shows | Options |
| --- | --- | --- |
| Church information | About text, address with directions, phone, email, giving and livestream links | Heading; show description; show contact |
| Service times | Weekly gatherings in the church's time zone | Heading |
| Upcoming events | Events that have not ended, in each event's own time zone | Heading; items per page; links to more |
| Recent sermons | Speaker, series, date, summary, audio, and video links | Heading; items per page; links to more |
| Groups | Schedule, place, audience, and whether it is open to join | Heading; items per page; links to more |
| Courses | Summary and lessons, linking to the course's public page on Fellowship42 | Heading; items per page; links to more |

Themes can place the same components outside Portable Text:
`import { UpcomingEvents } from '@fellowship42/emdash/components'`. Blocks read
`--f42-accent`, `--f42-ink`, `--f42-muted`, `--f42-card`, `--f42-border`,
`--f42-radius`, and `--f42-heading-font` so a theme can restyle them.

## Fellowship42 first

A generated installation deploys `apps/website` as a second Worker with its own
D1 database, R2 bucket, and session KV, on its own hostname. It adopts the
church's Fellowship42 style preset and seeds these pages: Home, About, Plan a
visit, Events, Sermons, Groups, Courses, and a first article. If an editor
removes one of the church pages, a built-in version with the same blocks still
answers at `/visit`, `/events`, `/sermons`, `/groups`, and `/courses`.

Fellowship42 also decides how the church is named and branded on this website.
The header, the home page hero, the site name in each page's `<title>`, the
tagline, and the logo show the connected church's name, welcome line, and logo
from Fellowship42 **Settings**. EmDash's own site settings (title, tagline, and
logo) are only a fallback, shown while church information is unavailable or the
church is unpublished. To rename the church or change its logo, edit Settings
in Fellowship42 and publish.

Owner journey:

1. Sign in to Fellowship42 at `/app` with your passkey.
2. In **Settings**, the **Website** card shows the website address. Choose
   **Set up website editor**. Only owners see this, and only while the
   installation holds a `WEBSITE_SETUP_SECRET`.
3. The website opens its setup page, accepts the ten-minute claim, and hands
   over to EmDash's setup wizard. Enter a site title (the fallback described
   above) and your details, then create your EmDash passkey. You become the
   website's first Administrator.
4. Edit pages in the website editor. **Preview** shows an unpublished edit
   through a private, expiring link. **Publish** makes the page public.
5. Invite other editors from the EmDash **Users** screen (a copyable invite link
   works without email) and give them the Editor or Author role.
6. Remove `WEBSITE_SETUP_SECRET` from both Workers once setup is done.

In Fellowship42, **Settings → Preview profile** shows the saved, unpublished
church profile on the instance's own page, not in the website's design. The
website reads only published records, so it shows profile changes after you
publish them.

### The setup gate

Until an administrator exists, the website accepts EmDash setup only from a
browser that holds a valid owner claim. Without one:

- EmDash's setup wizard (`GET /_emdash/admin/setup`) redirects (`303`) to the
  website's Fellowship42 setup page, `/fellowship42/setup`;
- EmDash's setup APIs (`/_emdash/api/setup` and everything under it except
  `/_emdash/api/setup/status`) answer `403`. That includes EmDash's
  development setup shortcuts, `/_emdash/api/setup/dev-bypass` and
  `/_emdash/api/setup/dev-reset`.

After the first administrator exists, EmDash closes setup itself.

EmDash's OAuth sign-in (GitHub or Google) makes the first OAuth user an
Administrator while setup is open, which would bypass the owner claim. So while
`WEBSITE_SETUP_SECRET` is configured, the website answers `403` to EmDash's OAuth
start routes, `/_emdash/api/auth/oauth/<provider>`. The OAuth callback is not
gated; without a started flow it has nothing to complete. Do not enable OAuth
sign-in (`EMDASH_OAUTH_GITHUB_CLIENT_ID` and `_SECRET`,
`EMDASH_OAUTH_GOOGLE_CLIENT_ID` and `_SECRET`, or their `GITHUB_*` and
`GOOGLE_*` aliases) until the first administrator exists and the secret has been
removed from both Workers.

Under `astro dev`, EmDash's development sign-in shortcut
`/_emdash/api/auth/dev-bypass` is not a setup route and is not gated: it signs
in a development administrator (`dev@emdash.local`) without a claim. Production
builds refuse it. See [deployment](deployment.md) for the website's resources,
configuration, and hostnames.

## EmDash first

> **Not yet published.** `@fellowship42/emdash`,
> `@fellowship42/website-contract`, and the `fellowship42-connect` registry
> artifact are not yet on npm or the EmDash registry, so `pnpm add` and a
> registry install fail today. Publication follows independent review. Until
> then, evaluate this path from packed tarballs as described under
> [Evaluate before publication](#evaluate-before-publication).

On an EmDash 1.0.1 site the church already runs:

1. A site developer installs the trusted integration and registers it:

   ```sh
   pnpm add @fellowship42/emdash
   ```

   ```js
   // astro.config.mjs
   import { fellowship42 } from '@fellowship42/emdash'
   emdash({ /* database, storage */ plugins: [fellowship42()] })
   ```

   Then add the no-cache middleware from [Caching](#caching), rebuild, and
   deploy. EmDash loads Portable Text blocks and their renderers only from
   trusted npm packages registered in the site's code, so this step needs
   source and deploy access, not an EmDash role.
2. An Administrator opens **Plugins → Fellowship42 → Settings** and enters the
   instance's public Fellowship42 address (for example
   `https://app.example.org`). Private and local addresses are refused; see
   [Connection rules](#connection-rules).
3. The **Fellowship42** admin page confirms the connected church and shows its
   full 64-character church identity digest as copyable text. To refuse any
   other church, copy that digest into **Church identity** in the plugin
   settings. The same value is `instance.portableIdentitySha256` in
   `https://<instance>/api/website/v1` and `bootstrap.portableIdentitySha256`
   in `https://<instance>/api/health`.
4. Editors can now insert church blocks.

To pin the connection instead, set `FELLOWSHIP42_URL` (and optionally
`FELLOWSHIP42_INSTANCE_SHA256`) in the site's environment; see
[Connection rules](#connection-rules) for what each pin overrides. When the
site runs in the same Cloudflare account as the instance and pins
`FELLOWSHIP42_URL`, a `FELLOWSHIP42` service binding carries the requests.

### The registry connector

`fellowship42-connect` ([`packages/emdash-connect`](../packages/emdash-connect))
is the artifact the EmDash plugin registry can distribute. Once it is
published, an Administrator can install it from the registry without a deploy.
It provides the connection, a status page, public JSON routes, and structured
data. It cannot add church blocks: EmDash 1.0.1's registry carries only
sandboxed plugins, which cannot declare Portable Text blocks, ship Astro
components, or reach private or loopback addresses. A site that wants the
blocks installs the npm package above; it does not need both.

### Evaluate before publication

The automated journey packs both npm packages, installs them into a copy of
EmDash 1.0.1's Cloudflare starter site, connects it through plugin settings to
an isolated synthetic instance, and checks the blocks, access boundaries,
caching headers, and content lifecycle on production builds:

```bash
pnpm acceptance:emdash-first   # writes /tmp/f42-acceptance/emdash-first.json
```

To try the integration in your own EmDash site, pack both packages from this
repository:

```bash
pnpm build:contracts
pnpm --filter @fellowship42/website-contract pack --pack-destination /tmp/f42-packs
pnpm --filter @fellowship42/emdash pack --pack-destination /tmp/f42-packs
```

In the site, depend on both tarballs (their file names carry each package's
version), and override the contract so the packed `@fellowship42/emdash`
resolves its dependency to the tarball rather than npm:

```jsonc
// package.json
"dependencies": {
  "@fellowship42/emdash": "file:/tmp/f42-packs/fellowship42-emdash-0.1.0.tgz",
  "@fellowship42/website-contract": "file:/tmp/f42-packs/fellowship42-website-contract-1.0.0.tgz"
}
```

```yaml
# pnpm-workspace.yaml
overrides:
  '@fellowship42/website-contract': 'file:/tmp/f42-packs/fellowship42-website-contract-1.0.0.tgz'
```

`scripts/acceptance/fixtures/emdash-first-site` is a complete example,
including the middleware from [Caching](#caching). A production build
connected through plugin settings to an instance on `localhost` also needs
`FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` in the site's environment; `astro dev`
does not. The registry connector is validated and bundled locally with
`pnpm --filter @fellowship42/emdash-connect test`.

## Connection rules

These rules apply to every site that uses `@fellowship42/emdash`, including
the Fellowship42-first website.

- **Deployment pins win.** `FELLOWSHIP42_URL` pins the instance address. When
  it is set, the plugin settings are not read at all, and both the address and
  identity settings are ignored. `FELLOWSHIP42_INSTANCE_SHA256` pins the
  church identity whenever it is set, even when the address comes from plugin
  settings; the identity setting is then ignored.
- **Settings addresses must be public.** An address from plugin settings must
  name a public host. The website refuses literal loopback, private,
  link-local, carrier-grade NAT (`100.64.0.0/10`), and unspecified IPv4 and
  IPv6 addresses, as well as `localhost`, `*.localhost`, `*.local`, and
  `*.internal`. The status page says why, and church blocks show a notice
  instead of church content. The site fetches that address from its own
  server, so this keeps an Administrator's setting from reaching the site's
  internal network. Two exceptions exist: a deployment opt-in,
  `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true`, meant for local evaluation and
  never for production; and Astro development mode (`astro dev`). An address
  pinned with `FELLOWSHIP42_URL` is trusted as given, including a private one.
- **The identity pin is a full digest.** A pin must be exactly 64 hexadecimal
  characters, the full digest the status page shows. Anything else, such as a
  shortened prefix, is reported on the status page as "The church identity pin
  is not a valid 64-character digest", and visitors see the unavailable
  notice. A valid pin that differs from the instance's digest is the
  "different church" state.
- **The service binding carries only a pinned address.** A `FELLOWSHIP42`
  service binding is used only when `FELLOWSHIP42_URL` is set. An address from
  plugin settings always goes through the runtime's `fetch`, even in the same
  account as the instance.
- **Settings failures do not break pages.** When the deployment does not pin
  the address and the site cannot read the plugin settings, church blocks show
  the unavailable notice and the site logs the failure; the rest of the page
  renders normally.

## Caching

Church blocks read Fellowship42 each time a page renders. A stored copy of the
page would keep showing withdrawn or deleted records, and a church block cannot
opt its page out of caching by itself: the response headers are decided before
the blocks finish rendering. Pages that show church blocks or components must
therefore render on demand and must not be cached by EmDash route caching or
the Workers Cache:

- do not prerender them (`export const prerender = true`), including pages
  whose layout places church components;
- do not give them a cache lifetime, either with route-cache rules (for
  example `routeRules` with `cacheCloudflare()`) or with
  `Astro.cache.set({ maxAge })`; and
- send `Cache-Control: no-cache` on public HTML, so browsers and CDNs
  revalidate instead of keeping a copy. Without a header, a cached `200` can be
  kept for hours.

The Fellowship42-first website does this in
[`apps/website/src/outer-middleware.ts`](../apps/website/src/outer-middleware.ts).
An EmDash-first site adds this middleware, the same recipe as the
[`@fellowship42/emdash` README](../packages/emdash/README.md#caching) and the
EmDash-first acceptance fixture. Astro loads `src/middleware.ts` on its own, so
`astro.config.mjs` needs no change:

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware'

// Church blocks render live Fellowship42 data; never serve a stored copy.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()
  const isHtml = response.headers
    .get('Content-Type')
    ?.toLowerCase()
    .startsWith('text/html')
  if (!isHtml || context.url.pathname.startsWith('/_emdash')) return response
  if (context.cache.enabled) context.cache.set(false)
  if (response.headers.has('Cache-Control')) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})
```

If the site already has a `src/middleware.ts`, add these steps to its
`onRequest` after `next()` instead of creating a second file. Route caching
follows its own options rather than `Cache-Control`, so when a cache provider
is configured the middleware also opts the page out of it with
`context.cache.set(false)`; that overrides the `Astro.cache.set(...)` hints
EmDash's starter pages and layouts add. The middleware leaves an explicit
`Cache-Control` alone, so it does not weaken EmDash's own `private, no-store`
responses. Keep route-cache rules off these pages anyway: a cache provider
answers from its store before any middleware runs, so a copy stored before the
middleware was added would still be served.

## Sign-in and permissions

- Website editors use EmDash accounts: passkeys and invitations, with EmDash's
  Subscriber, Contributor, Author, Editor, and Administrator roles. An EmDash
  account confers no Fellowship42 finance, directory, team, or fleet access.
- The **Fellowship42** status page is open to Contributors, Authors, Editors,
  and Administrators (EmDash's `content:create` permission). Only
  Administrators see its **Connection settings** link.
- Only EmDash Administrators can change the Fellowship42 connection. A pinned
  connection cannot be changed from the website at all.
- OAuth sign-in stays off until the first administrator exists and
  `WEBSITE_SETUP_SECRET` is removed; see [The setup gate](#the-setup-gate).
- Disabling or deleting an EmDash user ends that user's access on the next
  request. Removing a Fellowship42 owner stops that person from issuing
  website setup claims.
- There is no privileged connection. The website reads public, published
  content, sends no credential, and has nothing to revoke on the Fellowship42
  side. Fellowship42 staff sessions and EmDash previews never expose
  Fellowship42 drafts: the website receives only published records.
- Seamless single sign-on between Fellowship42 and EmDash is not built.

## Local evaluation

Synthetic data only; no production credentials. With the toolchain in
[AGENTS.md](../AGENTS.md):

```bash
pnpm install
cp apps/instance/.dev.vars.example apps/instance/.dev.vars
cp apps/website/.dev.vars.example apps/website/.dev.vars
# Use the same WEBSITE_SETUP_SECRET (32+ characters) in both files.
# Start fresh: the instance's state and the website's EmDash state together.
rm -rf apps/instance/.wrangler/state apps/website/.wrangler/state
pnpm db:migrate && pnpm db:seed
(cd apps/instance && node scripts/recover-owner.mjs --config wrangler.jsonc \
  --database fellowship42 --origin http://localhost:5173 \
  --email owner@example.test --output /tmp/owner-link.txt --local \
  --confirm-reset-owner)
pnpm dev            # instance: http://localhost:5173
pnpm dev:website    # website:  http://www.localhost:4322
```

Reset both states together. EmDash closes setup once its first administrator
exists, so if `apps/website/.wrangler/state` survives from an earlier run,
**Set up website editor** cannot create a new first administrator.

The website uses `www.localhost` so that, as in production, the two apps have
different hostnames and therefore separate passkeys. On a shared `localhost`
both passkeys would be offered, and choosing the wrong one fails sign-in.
Open the link in `/tmp/owner-link.txt`, create a passkey, and follow the owner
journey above. The website reaches the local instance because
`apps/website/.dev.vars` pins `FELLOWSHIP42_URL=http://localhost:5173`, which
is trusted as given, and the trusted plugin uses the runtime's `fetch`.
Publish, edit, withdraw, and delete events or sermons in `/app`, and reload
the website to see each change. `astro dev` keeps EmDash's development sign-in
shortcut (`/_emdash/api/auth/dev-bypass`) available; production builds refuse
it. To evaluate exactly what deploys, run the automated journeys, which use
production builds on isolated synthetic state:

```bash
pnpm acceptance:fellowship42-first   # Chromium with virtual passkeys
pnpm acceptance:emdash-first         # a separate EmDash site from packed tarballs
```

The first writes `evidence.json` and screenshots to
`/tmp/f42-acceptance/fellowship42-first`; the second writes
`/tmp/f42-acceptance/emdash-first.json`.

## Ownership, backup, and exit

A Fellowship42-first website is part of the church's installation. Its D1
database and R2 bucket are exported, restored, and handed over with the
instance. Its session KV is disposable. `EMDASH_ENCRYPTION_KEY` must be kept
with the backups because it decrypts EmDash secret settings. See
[portable exports](portable-exports.md) and
[exit packets](exit-packets.md).

EmDash's own site transfer (`emdash site export`) moves pages, articles,
menus, and media to another EmDash site. It does not carry users, plugin
settings, or the integration's code, so an unpinned connection must be entered
again after a transfer. An independently operated EmDash site keeps its own
hosting, backups, and upgrades; Fellowship42 tooling covers only the
installation it generated.

## Troubleshooting

| Notice or admin state | Meaning | Action |
| --- | --- | --- |
| Not connected | No Fellowship42 address | Set the address (Administrator) or `FELLOWSHIP42_URL` |
| Private or local address refused | The plugin-settings address names a private or local host | Use the instance's public address, or pin it with `FELLOWSHIP42_URL`. For local evaluation only, set `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` |
| The church identity pin is not a valid 64-character digest | The pin is not exactly 64 hexadecimal characters, for example a shortened prefix | Copy the full digest from the status page, `/api/website/v1`, or `/api/health` |
| Not published | Fellowship42 church website is unpublished | Publish the church in Fellowship42 Settings |
| Not responding | Network failure, timeout, `429` or `5xx`, a response cut off while it was read, or plugin settings that could not be read | Check the address, instance health, and the site's logs; blocks recover on the next load |
| Not a compatible instance | Not a Fellowship42 instance, another contract version, malformed JSON, or an unexpected `4xx` error | Check the address; update the integration |
| Different church | The identity digest differs from the pin | Correct the address or the pin |
| That page of results is no longer available | A block's paging link came from another list, was altered, or is longer than the contract allows (cursors are bound to their list and at most 1,024 characters) | Start again from the block's first page |
