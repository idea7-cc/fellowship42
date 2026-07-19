# Fellowship42 repository instructions

This is the public Fellowship42 repository. Read this file, `README.md`,
`docs/architecture.md`, and `docs/repository-strategy.md` before changing the
system shape.

## Non-negotiable product invariants

1. One Fellowship42 deployment is one portable church instance and one
   operational, ownership, backup, and migration boundary.
2. The open-source instance must remain fully useful without Fellowship42
   Cloud, a partner, or any private service.
3. Management is optional and revocable. Disconnecting it must not break the
   instance, remove data, or block export.
4. A church-owned Cloudflare account is the strongest ownership mode. Hosted
   and partner-operated modes must preserve a documented exit path.
5. Use standard HTTPS and well-reviewed cryptography for management transport.
   Do not invent encryption. MCP may adapt the management API for AI clients;
   it is not the durable fleet protocol.
6. Private billing, fleet orchestration, partner administration, and dashboard
   code must never be added to this repository.

## Repository boundaries

- `apps/instance` is the only deployable church product. It contains the React
  UI, Hono API, D1 migrations, R2 integration, and Durable Objects.
- `apps/project-site` is the public project/community site. It is not the
  hosted-service dashboard.
- `packages/management-protocol` is the public, versioned contract shared with
  optional management software. It must not import an application or private
  control-plane package.
- `packages/brand` is public shared presentation code.
- `tooling/f42ctl` is reserved for portable provisioning, export, import,
  verification, and management enrollment tooling.
- The separate private repository is named `fellowship42-cloud`. It consumes
  published protocol packages and pinned Fellowship42 release artifacts.

Dependency direction is one-way:

```text
apps/instance ──► packages/management-protocol
       │
       └────────► packages/brand

fellowship42-cloud (separate private repo)
       └────────► published management protocol + release artifacts
```

The public instance must never import from the private repository. The private
repository must operate instances through public contracts rather than private
database access or unpublished application internals.

## Data and security rules

- Keep `church_id` checks and composite tenant foreign keys even though the
  deployment boundary is a single church. They remain defense in depth and
  preserve explicit domain ownership.
- `instance_metadata` is the singleton portable installation identity. Do not
  use a Cloudflare account ID, Worker name, D1 ID, or control-plane customer ID
  as the portable instance ID.
- Never put Cloudflare credentials, management private keys, Access JWTs,
  production exports, donor data, or member data in source control or logs.
- Management capabilities are deny-by-default, independently revocable, and
  audited. Infrastructure deployment credentials are separate from instance
  management credentials.
- D1 is authoritative. R2 objects require D1 authorization metadata. Durable
  Objects coordinate realtime state and do not become the business record.
- Keep browser state out of authorization decisions. Validate input and use
  prepared D1 statements.

## Cloudflare implementation rules

- Use generated binding types from `pnpm cf-typegen` after Wrangler changes.
- Prefer bindings over Cloudflare REST APIs inside the instance Worker.
- Use structured logs, Web Crypto, handled promises, and `waitUntil` for work
  that safely continues after a response.
- Keep `wrangler.jsonc` current, observable, and free of secrets.
- Use Queues or Workflows for durable background delivery when that work is
  implemented.

## Change checklist

Run the following before handoff:

```bash
pnpm check:architecture
pnpm typecheck
pnpm test
pnpm build
pnpm deploy:dry-run
pnpm deploy:site:dry-run
```

Tagged releases and management-protocol packages follow `docs/releases.md`.
The private repository must pin a published artifact and checksum; it must not
consume a relative checkout or an unpublished public branch.

Any change to ownership, deployment topology, management trust, repository
boundaries, portability, authentication, or data custody requires an ADR in
`docs/adr`.
