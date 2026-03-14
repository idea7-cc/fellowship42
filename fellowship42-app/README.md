# Fellowship42 MVP

Fellowship42 is a church software MVP built with `Payload`, `Next.js`, and `Postgres`.

It currently includes:
- multi-church records
- users and role-aware admin access
- churches, ministries, groups, group memberships, group sessions, attendance records, courses, course enrollments, events, sermons, facilities, people, and contributions
- a public landing page and public church website route at `/churches/[slug]`
- ministry, group, and course landing pages with inherited church themes and optional page-level overrides
- a protected member portal at `/portal`
- a protected leader workspace at `/portal/leader`
- a repeatable seed command for demo content

## Local development

1. Copy `.env.example` to `.env` if needed.
2. Start Postgres:
   - `docker compose up -d postgres`
3. Install dependencies:
   - `npm install`
4. Generate types:
   - `npm run generate:types`
5. Seed demo data:
   - `npm run seed`
6. Start the app:
   - `npm run dev`
   - this now starts from a clean `.next` build cache to avoid stale dev artifacts

The admin panel is at `http://localhost:3000/admin`.

Seeded admin credentials:
- `admin@fellowship42.local`
- `changeme123`

Seeded leader credentials:
- `leader@fellowship42.local`
- `changeme123`

Seeded member credentials:
- `member@fellowship42.local`
- `changeme123`

## Useful scripts

- `npm run dev`
- `npm run dev:fast`
- `npm run generate:types`
- `npm run seed`
- `npm run typecheck`
- `npm run test`

## Cloudflare direction

The codebase is structured around `Payload + Postgres`, with Cloudflare intended as the primary runtime and edge layer. Postgres is expected to be hosted externally, with Hyperdrive used when the app is deployed on Cloudflare Workers.
