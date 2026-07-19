# Fellowship42 instance

This directory is one complete, deployable church installation. The React SPA,
Hono API, D1 migrations, R2 binding, Durable Object, per-instance outbox Queue,
and generated Cloudflare binding types version and deploy together.

```text
src/                       browser application
worker/                    server-side Worker code
  management/              optional management boundary; disabled by default
  routes/                  public and authenticated application APIs
  lib/                     shared Worker authorization, errors, and mappings
migrations/                forward-only portable D1 schema
test/                      Workers-runtime integration tests
wrangler.jsonc             development deployment template
```

## Instance invariants

- A deployed copy is an ownership and migration boundary for one church.
- `instance_metadata` contains the portable installation identity and primary
  church. Cloudflare resource IDs are deployment details and are not identity.
- Domain tables retain `church_id` constraints as defense in depth.
- D1 is authoritative; Queue messages carry opaque outbox IDs and never church
  business payloads.
- The application works when management is disconnected.
- Management code may depend only on public contracts in
  `@fellowship42/management-protocol`; it must not import private cloud code.
- Export/import tooling must cover D1, R2, configuration, release metadata, and
  checksums while regenerating secrets at the destination.

Run it from the repository root with `pnpm dev`, and see
`../../docs/deployment.md` for remote deployment.
