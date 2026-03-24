# Fellowship42 Architecture

Technical architecture for the Fellowship42 church management platform.

---

## Stack

```
+-------------------------------------------------------------+
|  CLIENTS                                                     |
|  Vite React SPA (app) -- member portal, admin interface      |
|  Astro site (web)     -- marketing, public church pages      |
+-------------------------------------------------------------+
         |                              |
         | Convex React hooks           | Fetch from edge API
         | (real-time WebSocket)        | (static at build)
         v                              v
+---------------------------+  +---------------------------+
|  CONVEX CLOUD             |  |  CLOUDFLARE WORKERS       |
|  - Document database      |  |  - Hono edge API          |
|  - Server functions       |  |  - Public church APIs     |
|  - File storage           |  |  - Clerk/Stripe webhooks  |
|  - Scheduled jobs         |  |  - Server-side queries    |
|  - Auth (Clerk JWT)       |  |  - CORS + rate limiting   |
+---------------------------+  +---------------------------+
```

---

## Monorepo structure

```
fellowship42/
  packages/brand/       Shared design tokens, presets, CSS recipes
  convex/               Convex backend (schema, functions, auth)
  apps/app/             Vite React SPA (member portal / admin)
  apps/worker/          Hono on Cloudflare Workers (edge API)
  apps/web/             Astro marketing site
  docs/                 Architecture and design system docs
```

**Workspace manager:** npm workspaces
**Package linking:** `workspace:*` protocol

---

## Data flow

### React SPA (authenticated users)

1. User authenticates via Clerk
2. Clerk JWT is validated by Convex
3. React components use `useQuery()` / `useMutation()` hooks
4. Convex functions enforce access control via `convex/lib/access.ts`
5. Real-time subscriptions keep UI in sync

### Public church pages (via edge worker)

1. Request hits Cloudflare Worker
2. Hono route handler calls Convex HTTP API
3. Response is formatted and returned
4. Optional: KV cache for hot paths

### Webhooks

1. Clerk/Stripe sends webhook to `/api/webhooks/*`
2. Hono handler verifies signature
3. Calls Convex mutation to update data

---

## Convex backend

### Schema: 16 tables

All multi-tenant data is scoped by `churchId` with compound indexes.

**Core:** `churches`, `users`, `people`, `media`
**Ministry:** `ministries`, `groups`, `groupMemberships`, `groupSessions`, `attendanceRecords`
**Education:** `courses`, `courseEnrollments`
**Content:** `events`, `sermons`, `landingPages`
**Operations:** `facilities`, `contributions`

### Access control

| Helper | Purpose |
|--------|---------|
| `requireAuth(ctx)` | Ensures JWT is present |
| `requireUser(ctx)` | Resolves to user document |
| `requireRole(ctx, roles)` | Checks user has at least one role |
| `requireChurchAccess(ctx, churchId)` | Checks user can manage this church |
| `isSuperAdmin(user)` | Boolean check |
| `canManageChurch(user, churchId)` | Boolean check |

### Roles

| Role | Access level |
|------|-------------|
| `super-admin` | Full access to all data across all churches |
| `church-admin` | Full access to their church(es) |
| `finance` | Financial/contribution data only |
| `content-editor` | Content creation/management |
| `ministry-leader` | Ministry-specific leadership |
| `member` | Basic member access |

---

## Auth flow

1. **Clerk** handles authentication (sign-up, sign-in, OAuth, MFA)
2. **Convex auth.config.ts** validates Clerk JWTs
3. **`users.getOrCreateFromClerk`** upserts user record on first login
4. **`convex/lib/access.ts`** resolves identity to user document in every function

---

## Brand/theming system

### Per-church theming

Every church selects a brand preset (7 options) or customizes individual tokens.
The `ChurchTheme` React component wraps content and overrides CSS custom
properties so all descendant shadcn/ui components automatically use the
church's colors, fonts, and border radius.

### Token flow

```
packages/brand/src/tokens.css    (CSS custom properties)
            |
            v
globals.css @theme inline {}     (maps to Tailwind utilities)
            |
            v
ChurchTheme component            (overrides vars per-church via inline styles)
            |
            v
All shadcn/ui components         (consume vars automatically)
```

---

## Development

```bash
# Install dependencies
npm install

# Start Convex dev server (watches for schema/function changes)
npm run dev:convex

# Start Vite React SPA (port 5173)
npm run dev

# Start Hono worker (port 8787)
npm run dev:worker

# Start Astro marketing site (port 4321)
npm run dev:web

# Type-check all workspaces
npm run typecheck
```

### Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_CONVEX_URL` | apps/app | Convex deployment URL |
| `CLERK_JWT_ISSUER_DOMAIN` | convex | Clerk JWT validation |
| `CLERK_WEBHOOK_SECRET` | apps/worker | Clerk webhook verification |
| `STRIPE_WEBHOOK_SECRET` | apps/worker | Stripe webhook verification |
| `STRIPE_SECRET_KEY` | apps/worker | Stripe API calls |

---

## Deployment targets

| App | Platform | URL pattern |
|-----|----------|-------------|
| React SPA | Cloudflare Pages | `app.fellowship42.com` |
| Astro site | Cloudflare Pages | `fellowship42.com` |
| Edge worker | Cloudflare Workers | `api.fellowship42.com` |
| Backend | Convex Cloud | Managed (no deploy needed for dev) |
