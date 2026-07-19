# Deploying one Fellowship42 instance

This runbook bootstraps one independent church installation. Repeat it with
dedicated resources for each church. Do not bind multiple hosted customers to a
shared D1 database or R2 namespace.

The committed configuration is a direct Wrangler template. The future public
`f42ctl` and private Fellowship42 Cloud orchestrator must converge on this same
instance shape.

## 1. Choose custody

Record these separately:

- **Infrastructure owner:** Fellowship42 or the church.
- **Operator:** Fellowship42, the church, or a certified partner.

For maximum portability, deploy into a dedicated church-owned Cloudflare
account and grant the operator only the required access. For the lowest-friction
hosted tier, Fellowship42 may initially own the account or hosted namespace, but
must provide the export/redeployment exit described below.

## 2. Authenticate and create dedicated resources

```bash
pnpm --filter @fellowship42/instance exec wrangler login
pnpm --filter @fellowship42/instance exec wrangler d1 create fellowship42
pnpm --filter @fellowship42/instance exec wrangler r2 bucket create fellowship42-media
```

Copy the D1 UUID into `apps/instance/wrangler.jsonc`. The committed all-zero ID
is intentionally non-deployable scaffolding. Use instance-specific resource
names in any account that contains more than one Fellowship42 installation.

Never reuse a Cloudflare account ID, Worker name, D1 UUID, R2 bucket name, or
control-plane customer ID as the portable `instance_id`.

## 3. Configure application authentication

The current adapter uses a Cloudflare Access self-hosted application. Configure
the instance domain and intended allow policies, then set these non-secret
Worker variables:

- `ACCESS_TEAM_DOMAIN`: `https://<team>.cloudflareaccess.com`
- `ACCESS_AUD`: the Access application audience tag

The application route must be protected by the same Access application whose
audience is configured in the Worker. Public routes can move to a separate
hostname when public church-site delivery is implemented.

Management identity is separate from application login and separate from any
Cloudflare API token. No management endpoint is currently enabled.

## 4. Verify and migrate

```bash
pnpm cf-typegen
pnpm check:architecture
pnpm typecheck
pnpm test
pnpm build
pnpm deploy:dry-run
pnpm db:migrate:remote
```

Do not run `seed.sql` against production. Production onboarding must create the
church, portable instance identity, initial owner, and system roles through an
authenticated bootstrap flow.

## 5. Deploy and verify

```bash
pnpm deploy
```

Attach the instance custom domain and verify:

- `/api/health` reports `fellowship42-instance` and `single-church`;
- `instance_metadata` has one portable identity and primary church;
- published church routes return only intended public data;
- unauthenticated private routes return `401`;
- a user without permission receives `403`;
- authorized mutations write audit and outbox events;
- R2 responses preserve metadata and stream object bodies;
- logs include request IDs without tokens or sensitive bodies.

Deploy the optional public project site separately with:

```bash
pnpm deploy:site
```

## 6. Management enrollment

Remote management is not part of bootstrap and is not implemented yet. When it
is available, enrollment must be an explicit later action through `f42ctl
connect` or a local owner workflow. A deployment without enrollment is fully
supported.

## 7. Portability and exit

Before advertising hosted-to-self-managed migration as supported, automate and
test this sequence:

1. quiesce or reconcile writes;
2. export D1 schema and data;
3. copy every R2 object and verify checksums;
4. write an export manifest with portable and schema versions;
5. create fresh destination resources;
6. import and verify D1/R2 data;
7. rotate application, deployment, and management credentials;
8. switch and validate the domain;
9. revoke the former operator only after acceptance.

Account takeover is easiest when the church owns the account from the start.
Otherwise the supported guarantee is portable export and redeployment, not an
atomic transfer of Cloudflare resource IDs.

## 8. CI/CD

CI validates repository boundaries, types, Workers integration tests, and
production builds. Automated deployment should start from a tagged source
archive and verify its `release-manifest.json` and `SHA256SUMS` as described in
`releases.md`; a private checkout is not a release input. Deployment credentials
must be scoped to one church account or hosted fleet boundary. Preview and
production D1/R2 resources must remain separate.
