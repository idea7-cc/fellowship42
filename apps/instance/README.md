# Fellowship42 instance

This directory is the church application: the Worker that holds the church's
records and serves its staff workspace, APIs, and public contracts. A church
installation is this instance plus, optionally, the EmDash church website in
`../website`, deployed beside it with its own D1, R2, and session KV (see
[ADR 0027](../../docs/adr/0027-emdash-church-websites.md)). The instance is the
installation's only portable identity and authority for church records; the
website reads published records through the
[public website contract](../../docs/website-contract.md) and never this D1.

The React SPA, Hono API, D1 migrations, R2 binding, Durable Object,
per-instance outbox Queue, and generated Cloudflare binding types version and
deploy together.

```text
src/                       browser application
worker/                    server-side Worker code
  management/              optional management boundary; disabled by default
  routes/                  public and authenticated application APIs
  lib/                     shared Worker authorization, errors, and mappings
migrations/                the whole D1 schema in one file, edited in place before alpha
test/                      Workers-runtime integration tests
wrangler.jsonc             development deployment template
```

## Instance invariants

- A deployed copy, with its optional website, is an ownership and migration
  boundary for one church.
- `instance_metadata` contains the portable installation identity and primary
  church. Cloudflare resource IDs are deployment details and are not identity.
  The website pins its SHA-256 digest with `FELLOWSHIP42_INSTANCE_SHA256`.
- Domain tables retain `church_id` constraints as defense in depth.
- D1 is authoritative; Queue messages carry opaque outbox IDs and never church
  business payloads.
- The application works when management is disconnected.
- Management code may depend only on public contracts in
  `@fellowship42/management-protocol`; it must not import private cloud code.
- Export/import tooling must cover D1, R2, configuration, release metadata, and
  checksums while regenerating secrets at the destination. With a website it
  also covers the website's D1 and R2; its session KV is disposable.
- `/api/website/v1` returns only published, allowlisted fields and never reads
  identity. Adding a field there is a public disclosure.

Run it from the repository root with `pnpm dev` (and the website with
`pnpm dev:website`), and see `../../docs/deployment.md` for remote deployment.
