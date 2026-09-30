# Fellowship42 church website

The EmDash 1.0.1 site a Fellowship42 installation deploys beside the instance.
EmDash owns pages, articles, menus, and presentation; church records come from
the instance through the [public website contract](../../docs/website-contract.md)
using [`@fellowship42/emdash`](../../packages/emdash).

```text
astro.config.mjs          EmDash on Cloudflare: D1 DB, R2 MEDIA, session KV
src/outer-middleware.ts   setup gate and public cache policy (wraps EmDash)
src/pages/fellowship42/   owner setup-claim handoff
src/layouts/Base.astro    church theme from the Fellowship42 style preset
src/lib/church-pages.ts   built-in /visit, /events, /sermons, /groups, /courses
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

Run from the repository root with `pnpm dev:website` (after `pnpm dev` for the
instance). See [EmDash church websites](../../docs/emdash-church-websites.md)
for the owner journey and [deployment](../../docs/deployment.md) for resources.

The built Worker is about 4 MiB compressed, larger than Cloudflare's Workers
Free plan script limit; deploy it on a plan that allows it.
