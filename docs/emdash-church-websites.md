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
| Church profile, address, contact, and service times | Fellowship42 **Settings** | Publishing the church in Settings |
| Events, sermons, groups, and courses | Fellowship42 | Publishing each record there |

The website stores no copy of church records. A church block in a page stores
only display choices (heading, number of items, paging). Each page load reads
the currently published records, so a withdrawn or deleted record disappears
from every website on the next visit. When Fellowship42 cannot be reached, or
the connection points at another church or an incompatible version, blocks show
a plain "temporarily unavailable" notice. They never show stale content. Both
Fellowship42 Settings and the EmDash **Fellowship42** admin page state these
rules.

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

Owner journey:

1. Sign in to Fellowship42 at `/app` with your passkey.
2. In **Settings**, the **Website** card shows the website address. Choose
   **Set up website editor**. Only owners see this, and only while the
   installation holds a `WEBSITE_SETUP_SECRET`.
3. The website opens its setup page, accepts the ten-minute claim, and hands
   over to EmDash's setup wizard. Enter the site title and your details, then
   create your EmDash passkey. You become the website's first Administrator.
4. Edit pages in the website editor. **Preview** shows an unpublished edit
   through a private, expiring link. **Publish** makes the page public.
5. Invite other editors from the EmDash **Users** screen (a copyable invite link
   works without email) and give them the Editor or Author role.
6. Remove `WEBSITE_SETUP_SECRET` from both Workers once setup is done.

Until an administrator exists, EmDash's own setup routes, including its
development shortcuts, answer `403` unless the browser holds a valid claim.
Afterwards EmDash closes setup itself. See [deployment](deployment.md) for the
website's resources, configuration, and hostnames.

## EmDash first

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

   Rebuild and deploy. EmDash loads Portable Text blocks and their renderers
   only from trusted npm packages registered in the site's code, so this step
   needs source and deploy access, not an EmDash role.
2. An Administrator opens **Plugins → Fellowship42 → Settings** and enters the
   Fellowship42 address (for example `https://app.example.org`). Optionally,
   enter the church identity digest shown on the **Fellowship42** page to refuse
   any other church.
3. The **Fellowship42** admin page confirms the connected church. Editors can
   now insert church blocks.

To pin the connection instead, set `FELLOWSHIP42_URL` (and optionally
`FELLOWSHIP42_INSTANCE_SHA256`) in the site's environment. The settings are
then ignored. When the site runs in the same Cloudflare account as the
instance, a `FELLOWSHIP42` service binding carries the requests.

### The registry connector

`fellowship42-connect` ([`packages/emdash-connect`](../packages/emdash-connect))
is the artifact the EmDash plugin registry can distribute. An Administrator can
install it from the registry without a deploy. It provides the connection, a
status page, public JSON routes, and structured data. It cannot add church
blocks: EmDash 1.0.1's registry carries only sandboxed plugins, which cannot
declare Portable Text blocks, ship Astro components, or reach private or
loopback addresses. A site that wants the blocks installs the npm package
above; it does not need both.

## Sign-in and permissions

- Website editors use EmDash accounts: passkeys and invitations, with EmDash's
  Subscriber, Contributor, Author, Editor, and Administrator roles. An EmDash
  account confers no Fellowship42 finance, directory, team, or fleet access.
- Only EmDash Administrators can change the Fellowship42 connection. A pinned
  connection cannot be changed from the website at all.
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
rm -rf apps/instance/.wrangler/state
pnpm db:migrate && pnpm db:seed
(cd apps/instance && node scripts/recover-owner.mjs --config wrangler.jsonc \
  --database fellowship42 --origin http://localhost:5173 \
  --email owner@example.test --output /tmp/owner-link.txt --local \
  --confirm-reset-owner)
pnpm dev            # instance: http://localhost:5173
pnpm dev:website    # website:  http://www.localhost:4322
```

The website uses `www.localhost` so that, as in production, the two apps have
different hostnames and therefore separate passkeys. On a shared `localhost`
both passkeys would be offered, and choosing the wrong one fails sign-in.
Open the link in `/tmp/owner-link.txt`, create a passkey, and follow the owner
journey above. The website reaches the local instance directly because the
trusted plugin uses the runtime's `fetch`. Publish, edit, withdraw, and delete
events or sermons in `/app`, and reload the website to see each change.
`astro dev` keeps EmDash's development sign-in shortcut
(`/_emdash/api/auth/dev-bypass`) available; production builds refuse it. To
evaluate exactly what deploys, run the automated journey, which uses production
builds of both Workers on isolated synthetic state:

```bash
pnpm acceptance:fellowship42-first   # Chromium with virtual passkeys
```

It writes `evidence.json` and screenshots to `/tmp/f42-acceptance/fellowship42-first`.

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
| Not published | Fellowship42 church website is unpublished | Publish the church in Fellowship42 Settings |
| Not responding | Network failure or server error | Check the address and instance health; blocks recover on the next load |
| Not a compatible instance | Not a Fellowship42 instance, or another contract version | Check the address; update the integration |
| Different church | The identity digest differs from the pin | Correct the address or the pin |
