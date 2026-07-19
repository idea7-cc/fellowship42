# Deploying one Fellowship42 instance

This runbook bootstraps one independent church installation. Repeat it with
dedicated resources for each church. Do not bind multiple hosted customers to a
shared D1 database or R2 namespace.

The committed configuration is a direct Wrangler template. The public `f42ctl`
manifest, planner, and doctor describe and inspect this same shape; active
resource reconciliation is not implemented yet. The private Fellowship42
Cloud orchestrator must consume the public contract rather than inventing a
second deployment shape.

Before touching a Cloudflare account, copy and edit the non-secret example,
then review the deterministic plan:

```bash
cp tooling/f42ctl/examples/deployment-manifest.local.json deployment-manifest.json
pnpm f42ctl plan --manifest deployment-manifest.json
```

The manifest pins a tagged release manifest by URL, SHA-256, and source commit.
It uses a human account alias rather than a Cloudflare account ID and contains
no credentials. See [Lifecycle manifests and doctor](lifecycle-manifests-and-doctor.md).

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
pnpm --filter @fellowship42/instance exec wrangler queues create fellowship42-outbox
pnpm --filter @fellowship42/instance exec wrangler queues create fellowship42-outbox-dlq
```

Copy the D1 UUID into `apps/instance/wrangler.jsonc`. The committed all-zero ID
is intentionally non-deployable scaffolding. Use instance-specific D1, R2,
Queue, dead-letter Queue, and Worker names in any account that contains more
than one Fellowship42 installation.

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

Published church/media routes and the exact payment-webhook path must reach the
Worker without an Access login redirect. Prefer separate public and webhook
hostnames or narrowly scoped path applications; do not bypass Access for the
protected `/api` surface. The webhook path authenticates its adapter with the
timestamped HMAC described below.

Make the Access allow policy as narrow as possible for initial setup. Bootstrap
also requires a deployment-scoped `BOOTSTRAP_OWNER_EMAIL` Worker secret whose
value exactly matches the intended first owner's Access email. Do not put it in
`wrangler.jsonc`, a generated configuration file, CI output, or source control.

Management identity is separate from application login and separate from any
Cloudflare API token. No management endpoint is currently enabled.

If this instance accepts normalized payment events, set
`PAYMENT_WEBHOOK_PROVIDER` to the provider adapter name and create a unique
per-instance secret:

```bash
pnpm --filter @fellowship42/instance exec wrangler secret put PAYMENT_WEBHOOK_SECRET
```

Leave the provider variable empty when payment webhooks are unused. Never put
the secret or a provider payload in Wrangler configuration, logs, or source
control. The signed envelope is documented in
[Contributions and durable delivery](contributions-and-delivery.md).

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
pnpm --filter @fellowship42/instance exec wrangler secret put BOOTSTRAP_OWNER_EMAIL
```

Open the deployed application as that Access identity and complete **Instance
setup**. The Worker creates the church in `draft`, portable instance identity,
initial owner membership, system roles, and audit event transactionally. It
does not enroll the instance in any management service.

After setup succeeds, remove the one-time selector:

```bash
pnpm --filter @fellowship42/instance exec wrangler secret delete BOOTSTRAP_OWNER_EMAIL
```

Attach the instance custom domain and verify:

- `/api/health` reports `fellowship42-instance`, `single-church`, and coarse
  outbox/payment-webhook readiness;
- `instance_metadata` has one portable identity and primary church;
- the first owner has one active membership with the system `owner` role;
- `instance.bootstrapped` exists in the local audit log;
- published church routes return only intended public data;
- unauthenticated private routes return `401`;
- a user without permission receives `403`;
- authorized mutations write audit and outbox events;
- the instance Queue consumes an outbox probe and stale claims recover on the
  scheduled trigger;
- R2 responses preserve metadata and stream object bodies;
- logs include request IDs without tokens or sensitive bodies.

You can capture bounded machine-readable configuration and health evidence:

```bash
pnpm f42ctl doctor \
  --manifest deployment-manifest.json \
  --runtime https://instance.example.org \
  --output doctor-report.json
```

Doctor is read-only. Until a future locally authorized identity endpoint can
prove the portable installation ID, that check remains `unknown` and the
overall result is `attention`; it must not infer identity from Worker or
Cloudflare resource identifiers.

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
