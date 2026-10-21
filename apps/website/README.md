# Fellowship42 church website

The EmDash 1.0.1 site a Fellowship42 installation deploys beside the instance.
EmDash owns pages, articles, menus, and presentation; church records come from
the instance through the [public website contract](../../docs/website-contract.md)
using [`@fellowship42/emdash`](../../packages/emdash).

```text
astro.config.mjs          EmDash on Cloudflare: D1 DB, R2 MEDIA, session KV
src/outer-middleware.ts   wraps EmDash with src/lib/middleware.ts: setup gate,
                          public cache policy
src/pages/fellowship42/   owner setup-claim handoff
src/pages/500.astro       error page; reads neither D1 nor Fellowship42
src/layouts/Base.astro    church identity, theme, titles, canonical links
src/lib/church-pages.ts   built-in /about, /visit, /events, /sermons, /groups,
                          /courses
src/lib/theme.ts          Fellowship42 style preset, with AA-safe muted text
public/                   default icons (scripts/generate-icons.mjs)
seed/seed.json            collections, church pages, first article, menu
wrangler.jsonc            deployment template (no secrets)
```

## Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `EMDASH_SITE_URL` | var | The website's public origin (required for setup and passkeys) |
| `FELLOWSHIP42_URL` | var | The instance's public origin; pins the connection |
| `FELLOWSHIP42_INSTANCE_SHA256` | var | Optional identity pin (`/api/health` → `bootstrap.portableIdentitySha256`) |
| `FELLOWSHIP42` | service binding | Optional, same account: carries contract requests to the instance Worker |
| `EMDASH_ENCRYPTION_KEY` | secret | Encrypts EmDash secret settings; keep it with backups |
| `WEBSITE_SETUP_SECRET` | secret | Shared with the instance for the first-administrator claim; delete after setup |

## Behaviour

- **Church identity.** The header, home hero, `<title>`, and `og:site_name`
  use the connected church's name, tagline, and logo from Fellowship42.
  EmDash's site title, tagline, and logo are shown only while church
  information is unavailable or unpublished.
- **Titles and canonical links.** Pages are titled `Page — Church name` (or
  the separator set in EmDash's SEO settings). Canonical links use the site
  settings URL, else `EMDASH_SITE_URL`: the host EmDash's sitemap names, not
  whichever host (such as `workers.dev`) served the request. Articles are
  marked up as articles.
- **Reserved page slugs.** `home` is the home page: it renders at `/`, and
  `/home` (its preview and sitemap URL) redirects there. `articles`, `404`,
  and `500` belong to the site's own routes, so pages with those slugs are
  not reachable.
- **Errors.** A failing page renders `500.astro` with status 500. A stale
  `?cursor=` on `/articles` answers 400 with a link back to the first page.
- **Setup.** Until the first administrator exists, EmDash's setup routes
  need a Fellowship42 owner claim. While `WEBSITE_SETUP_SECRET` is set, the
  OAuth start routes (`/_emdash/api/auth/oauth/<provider>`) answer 403,
  because EmDash makes the first OAuth user an administrator. Configure
  GitHub or Google sign-in only after setup, once the secret is removed.
- **Caching.** Public HTML is sent with `Cache-Control: no-cache` and no
  route-cache rules apply, so church blocks always render live data.
- **Icons.** `public/` holds a default favicon and touch icon, served without
  running the Worker. A favicon set in EmDash's site settings replaces them.

Run from the repository root with `pnpm dev:website` (after `pnpm dev` for the
instance). See [EmDash church websites](../../docs/emdash-church-websites.md)
for the owner journey and [deployment](../../docs/deployment.md) for resources.

The built Worker is about 4 MiB compressed, larger than Cloudflare's Workers
Free plan script limit; deploy it on a plan that allows it.
