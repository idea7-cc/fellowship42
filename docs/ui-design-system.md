# Fellowship42 UI Design System

This document describes how the visual UI layer works across the Fellowship42
platform. It is intended for developers and AI agents that may work on the
codebase in the future.

---

## Architecture overview

The UI is organized in three layers:

```
+-------------------------------------------------------------+
|  PAGES  (apps/app/src/routes/*.tsx)                         |
|  Route components. Compose Layer 2 with data from Convex.   |
+-------------------------------------------------------------+
|  PRODUCT COMPONENTS  (apps/app/src/components/*.tsx)          |
|  F42-specific compositions: PageShell, Section, Hero,        |
|  CardGrid, ChurchTheme, Eyebrow, StatPanel, etc.             |
+-------------------------------------------------------------+
|  UI PRIMITIVES  (apps/app/src/components/ui/*.tsx)            |
|  shadcn/ui owned source code: Button, Card, Badge,           |
|  Input, Separator. Treated as owned -- modify freely.        |
+-------------------------------------------------------------+
|  BRAND TOKENS  (packages/brand/)                             |
|  CSS custom properties, presets, and theme resolution.        |
|  Shared across apps via the @fellowship42/brand workspace.   |
+-------------------------------------------------------------+
```

Pages import from `@/components/` and `@/components/ui/`. They never import
directly from external primitive libraries like Base UI or Radix.

---

## Technology choices

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Convex | Real-time database, server functions, file storage, auth |
| Edge API | Hono on Cloudflare Workers | Public church APIs, webhooks, integrations |
| App UI | React 19 SPA (Vite) | Member portal, admin interface with Convex React hooks |
| Marketing site | Astro 5 | Static HTML, React islands for interactivity |
| Styling | Tailwind CSS v4 | CSS-first config, no tailwind.config.ts |
| Component primitives | shadcn/ui | Owned source code in `src/components/ui/` |
| Complex custom primitives | Base UI (future) | For interactions shadcn doesn't cover |
| Utility | `cn()` from `@/lib/cn` | Merges Tailwind classes via `clsx` + `tailwind-merge` |
| Icons | Lucide React | Tree-shakeable icon library |
| Variants | `class-variance-authority` | Used in Button, Badge for variant patterns |
| Routing | React Router v7 | Client-side SPA routing |
| Auth | Clerk + Convex Auth | JWT-based identity with Convex user provisioning |

---

## Brand token system

### Files

| File | Purpose |
|------|---------|
| `packages/brand/src/tokens.css` | CSS custom properties -- the single source of truth |
| `packages/brand/src/presets.ts` | 7 church presets + `resolveTheme()` + `themeToCSS()` |
| `packages/brand/src/recipes.css` | Framework-free CSS patterns (glass card, hero, etc.) |
| `packages/brand/src/index.ts` | Barrel export -- import from `@fellowship42/brand` |

### CSS variable contract

The token system follows the **shadcn/ui variable naming convention** so that
all shadcn components work out of the box:

```css
:root {
  --background      /* Page background */
  --foreground      /* Primary text color */
  --card            /* Card/surface background */
  --card-foreground /* Card text color */
  --primary         /* Accent / action color */
  --primary-foreground /* Text on primary */
  --secondary       /* Secondary action background */
  --muted           /* Muted surface */
  --muted-foreground /* Muted text */
  --border          /* Border color */
  --ring            /* Focus ring color */
  --radius          /* Default border radius */
  --f42-accent-strong /* Darker accent variant */
  --f42-shadow-sm/md/lg /* Elevation shadows */
}
```

These map to Tailwind utilities via the `@theme inline` block in `globals.css`:
- `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`
- `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` (derived from `--radius`)

### Church-scoped overrides

When content renders inside a `<ChurchTheme>` wrapper, the semantic CSS
variables are overridden per-church via inline styles. Every descendant
component automatically picks up the new colors because they reference the
same variable names.

```tsx
// In a route page:
<ChurchTheme theme={church.theme}>
  {/* All Buttons, Cards, Badges inside here use the church's accent color */}
  <Button>Give online</Button>
</ChurchTheme>
```

The `themeToCSS()` function in `packages/brand/src/presets.ts` generates the
inline style object that remaps `--primary`, `--foreground`, `--card`, etc. to
the church's chosen colors.

---

## 7 brand presets

Churches select a preset in the admin panel. Each preset defines a
complete visual personality. Individual tokens can still be overridden.

| Preset | Accent | Surface | Ink | Radius | Body font | Heading font | Character |
|--------|--------|---------|-----|--------|-----------|-------------|-----------|
| **warm** | `#b85c38` (terra cotta) | `#f4ede3` (cream) | `#1d120c` (brown-black) | rounded | Classic serif | Serif display | Welcoming, traditional |
| **calm** | `#386c7a` (teal) | `#e9f4f3` (light cyan) | `#11242b` (dark navy) | soft | Humanist sans | Humanist sans | Peaceful, approachable |
| **bold** | `#9d3412` (deep red) | `#f6ede6` (warm beige) | `#171210` (near black) | sharp | Neutral sans | Modern sans | Energetic, contemporary |
| **classic** | `#2b4c7e` (navy blue) | `#eef2f7` (cool gray) | `#1a1f2e` (slate) | soft | Classic serif | Serif display | Mainline, established |
| **modern** | `#3d3d3d` (charcoal) | `#f5f5f5` (neutral gray) | `#1a1a1a` (near black) | sharp | Neutral sans | Modern sans | Minimal, urban |
| **forest** | `#2d6a4f` (deep green) | `#ecf5f0` (mint) | `#1b2e25` (dark green) | soft | Humanist sans | Humanist sans | Organic, nature-forward |
| **royal** | `#5b3a8c` (deep purple) | `#f3eef8` (lavender) | `#1e1528` (dark plum) | rounded | Classic serif | Serif display | Liturgical, high-church |

### Adding a new preset

1. **Choose a name** -- short, lowercase, one word (e.g. `"ocean"`).

2. **Add to the type** in `packages/brand/src/presets.ts`:
   ```ts
   export type BrandPresetName =
     | 'warm' | 'calm' | 'bold' | 'classic'
     | 'modern' | 'forest' | 'royal'
     | 'ocean'  // <- add here
   ```

3. **Add the preset object** to `presets` in the same file:
   ```ts
   ocean: {
     accent: '#1a6b8a',
     accentStrong: darken('#1a6b8a'),
     bodyFont: 'humanist-sans',
     headingFont: 'humanist-sans',
     heroTone: 'ocean',
     ink: '#0f2a35',
     radius: 'rounded',
     surface: '#e8f4f8',
   },
   ```

4. **Add to `presetNames` array** (same file).

5. **Update Convex schema** if using preset validation (currently uses `v.string()`
   for flexibility, so this step is optional).

6. **Run typecheck** -- TypeScript will catch missing cases.

### Adding custom theme options (beyond presets)

Churches can already override any individual token -- `accent`, `surface`,
`ink`, `radius`, `bodyFont`, `headingFont` -- in the admin panel.
The preset acts as the base; overrides take precedence.

To add a new customizable dimension (e.g. `shadowIntensity`):

1. Add the field to `ChurchThemeInput` in `packages/brand/src/presets.ts`.
2. Handle it in `resolveTheme()`.
3. Map it to CSS custom properties in `themeToCSS()`.
4. Add the field to the `churches` table schema in `convex/schema.ts`.
5. If it needs a Tailwind utility, add it to the `@theme inline` block in `globals.css`.

---

## Component reference

### UI primitives (`apps/app/src/components/ui/`)

These are **owned source code** from shadcn/ui. Modify them freely.

| Component | File | Key variants |
|-----------|------|-------------|
| `Button` | `ui/button.tsx` | `default`, `secondary`, `outline`, `ghost`, `link`, `destructive` x sizes `default`, `sm`, `lg`, `icon` |
| `Card` | `ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `Badge` | `ui/badge.tsx` | `default`, `pill`, `outline`, `muted`, `destructive` |
| `Input` | `ui/input.tsx` | Standard form input with brand styling |
| `Separator` | `ui/separator.tsx` | `horizontal`, `vertical` |

Add more via the shadcn CLI:
```bash
npx shadcn@latest add dialog
```

Or write them manually in `apps/app/src/components/ui/`.

### Product components (`apps/app/src/components/`)

| Component | File | Purpose |
|-----------|------|---------|
| `PageShell` | `page-shell.tsx` | Max-width container with padding. `padBottom` prop for portal views. |
| `Section` | `section.tsx` | Content section with optional `title` and `description` heading. |
| `Hero` / `HeroActions` | `hero.tsx` | Hero area. Variants: `default` (plain), `church` (glass card), `landing` (church-gradient card). |
| `CardGrid` | `card-grid.tsx` | Responsive auto-fit grid. `minWidth` prop (default 240px). |
| `ChurchTheme` | `church-theme.tsx` | Sets CSS custom properties for church-scoped branding. Wrap any church content in this. |
| `Eyebrow` | `eyebrow.tsx` | Small uppercase label above headings. Wraps `Badge`. |
| `StatPanel` | `stat-panel.tsx` | Glass card with key metrics for hero sections. |

---

## Styling rules

1. **All styling uses Tailwind utility classes** -- no custom CSS class names
   outside of `globals.css`'s base layer and the `@theme` block.

2. **Use the `cn()` helper** from `@/lib/cn` for conditional/merged classes.

3. **Church-dynamic styles** (gradients using `color-mix()` and `var()`) use
   inline `style` props, not Tailwind, because they depend on runtime CSS
   variables that Tailwind cannot know at build time.

4. **shadcn components are owned** -- edit `apps/app/src/components/ui/*.tsx` directly.
   Never import from an external component library in page code.

5. **Brand tokens are the single source of truth** -- colors, fonts, radius,
   and shadows are defined in `packages/brand/src/tokens.css`. The Tailwind
   `@theme` block maps them to utility classes.

---

## Convex data model

The backend uses Convex with 16 tables. All multi-tenant data is scoped by
`churchId` with appropriate indexes for query performance.

| Table | Key indexes | Purpose |
|-------|------------|---------|
| `churches` | `by_slug`, `by_status` | Church organizations |
| `users` | `by_email`, `by_clerk_id` | Authenticated users (linked to Clerk) |
| `people` | `by_church`, `by_church_and_email` | Church members and contacts |
| `media` | `by_church` | File uploads via Convex storage |
| `ministries` | `by_church_and_slug`, `by_church_and_status` | Ministry departments |
| `groups` | `by_church_and_slug`, `by_ministry` | Small groups, teams, classes |
| `groupMemberships` | `by_group`, `by_person`, `by_group_and_person` | Group enrollment |
| `groupSessions` | `by_group`, `by_group_and_date` | Meeting instances |
| `attendanceRecords` | `by_session`, `by_person` | Per-session attendance |
| `courses` | `by_church_and_slug`, `by_ministry` | Training and education |
| `courseEnrollments` | `by_course`, `by_person`, `by_course_and_person` | Course progress tracking |
| `events` | `by_church_and_slug`, `by_church_and_start_date` | Calendar events |
| `sermons` | `by_church_and_slug`, `by_church_and_preached_at` | Sermon archive |
| `facilities` | `by_church` | Rooms and spaces |
| `contributions` | `by_church`, `by_person`, `by_church_and_date` | Financial giving |
| `landingPages` | `by_church_and_slug`, `by_church_and_ministry/group/course` | Public-facing pages |

### Access control pattern

Every Convex function uses helpers from `convex/lib/access.ts`:
- `requireAuth(ctx)` -- Ensures JWT is present
- `requireUser(ctx)` -- Resolves to user document
- `requireRole(ctx, roles)` -- Checks user has at least one role
- `requireChurchAccess(ctx, churchId)` -- Checks user can manage this church
- `isSuperAdmin(user)` -- Boolean check

Public queries (church listings, published content) skip auth. Private
mutations and draft-content queries enforce church-scoped access.

---

## File structure

```
fellowship42/
+-- packages/
|   +-- brand/
|       +-- src/
|           +-- tokens.css       <- CSS custom properties (canonical source)
|           +-- presets.ts       <- 7 presets + resolveTheme() + themeToCSS()
|           +-- recipes.css      <- Framework-free CSS patterns
|           +-- index.ts         <- barrel export
+-- convex/
|   +-- schema.ts                <- 16-table Convex schema
|   +-- lib/access.ts            <- Access control helpers
|   +-- auth.config.ts           <- Clerk integration config
|   +-- churches.ts              <- Church queries/mutations
|   +-- users.ts                 <- User CRUD + Clerk sync
|   +-- people.ts                <- People directory
|   +-- ministries.ts            <- Ministry management
|   +-- groups.ts                <- Group management
|   +-- courses.ts               <- Course management
|   +-- events.ts                <- Event management
|   +-- sermons.ts               <- Sermon archive
|   +-- groupMemberships.ts      <- Group enrollment
|   +-- courseEnrollments.ts     <- Course progress tracking
|   +-- contributions.ts         <- Financial giving
|   +-- landingPages.ts          <- Public landing pages
+-- apps/
|   +-- app/                     <- Vite React SPA (member portal / admin)
|   |   +-- src/
|   |       +-- globals.css      <- Tailwind + tokens + theme mapping + base layer
|   |       +-- main.tsx         <- ConvexProvider + BrowserRouter entry
|   |       +-- App.tsx          <- Route definitions
|   |       +-- lib/
|   |       |   +-- cn.ts        <- cn() utility (clsx + tailwind-merge)
|   |       |   +-- theme.ts     <- Re-exports brand + themeToCSS wrapper
|   |       +-- components/
|   |       |   +-- ui/          <- shadcn/ui owned primitives
|   |       |   +-- page-shell.tsx, section.tsx, hero.tsx, etc.
|   |       +-- routes/
|   |           +-- dashboard.tsx, churches.tsx, church-detail.tsx, etc.
|   +-- worker/                  <- Hono on Cloudflare Workers (edge API)
|   |   +-- src/
|   |       +-- index.ts         <- Hono app with CORS, logging, error handling
|   |       +-- routes/          <- churches, webhooks, health
|   |       +-- lib/convex.ts    <- HTTP client for server-side Convex queries
|   +-- web/                     <- Astro marketing site
|       +-- src/
|           +-- styles/global.css
|           +-- components/
|           +-- pages/
+-- docs/
    +-- ui-design-system.md      <- This document
    +-- fellowship42-product-plan.md
```

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Convex as backend | Real-time subscriptions, document database, server functions, file storage, auth -- replaces Payload + Postgres |
| Hono on Cloudflare Workers | Lightweight edge API for public church sites, webhooks, integrations. V8-based runtime. |
| Vite React SPA | Fast HMR, modern build tool, clean separation from backend. Convex React hooks for real-time data. |
| Astro for marketing | Zero JS by default, maximum performance. React islands for interactive components. |
| shadcn/ui as owned source | Full control over components, no version lock-in, tree-shakeable |
| Tailwind v4 (CSS-first) | No JS config file, automatic content detection, modern |
| CSS variables for theming | Works at runtime (per-church), no build step per church |
| `@theme inline` mapping | Bridges CSS variables to Tailwind utilities |
| Inline styles for church gradients | `color-mix()` with CSS variables can't be expressed as static Tailwind classes |
| Separate brand package | Enables sharing between all apps in the monorepo |
| 7 presets as starting point | Covers the spectrum of U.S. Protestant/Evangelical church aesthetics |
| Clerk for auth | Production-ready auth with JWT-based Convex integration |
| `workspace:*` dependencies | Clean monorepo linking via pnpm workspaces |
