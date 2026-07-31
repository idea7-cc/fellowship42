# Fellowship42 UI Design System

How the visual layer works across the Fellowship42 platform, for developers and
AI agents working on the codebase.

---

## The governing idea: two identities, kept apart

Fellowship42 renders two different kinds of surface, and conflating them is the
single easiest way to make this product worse.

| | Product chrome | Church brand |
|---|---|---|
| **What it is** | The operator UI: navigation, tables, forms, dashboards | A congregation's own accent, surface, ink, and fonts |
| **Who it serves** | Staff doing work | Members and visitors |
| **Palette** | One neutral Fellowship42 identity, identical for every church | Whatever the church chose |
| **Tokens** | The shadcn semantic contract: `--background`, `--card`, `--primary`, … | The `--church-*` namespace |

**A church's preset must never repaint the operator chrome.** A directory, a
ledger, and an audit log have to be equally legible whether the church picked
terracotta or lavender. This is also what Planning Center, Linear, and Stripe
do: the tool has its own voice, and the customer's brand lives on
customer-facing surfaces.

The church accent appears in operator screens only as a small identifying mark
— the sidebar church chip, the avatar on a church card. Full church branding is
opt-in per region via `<ChurchTheme scope="surface">`.

---

## Architecture overview

```
+-------------------------------------------------------------+
|  PAGES  (apps/instance/src/routes/*.tsx)                     |
|  Route components. Compose layer 2 with typed edge API data. |
+-------------------------------------------------------------+
|  PRODUCT COMPONENTS  (apps/instance/src/components/*.tsx)    |
|  PageShell, PageHeader, Toolbar, Section, CardGrid, Metric,  |
|  Hero, ChurchTheme, Eyebrow, AppShell                        |
+-------------------------------------------------------------+
|  UI PRIMITIVES  (apps/instance/src/components/ui/*.tsx)      |
|  Owned source: Button, Card, Badge, Table, Input, Select,    |
|  Textarea, Field, Tabs, Avatar, Skeleton, EmptyState,        |
|  Separator                                                   |
+-------------------------------------------------------------+
|  BRAND TOKENS  (packages/brand/)                             |
|  CSS custom properties, church presets, theme resolution     |
+-------------------------------------------------------------+
```

Pages import from `@/components/` and `@/components/ui/`. They never import
directly from an external primitive library.

---

## Technology choices

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Cloudflare D1 + R2 + Durable Objects | Relational data, media, realtime coordination |
| Edge API | Hono on Cloudflare Workers | Public and protected APIs, webhooks, integrations |
| App UI | React 19 SPA (Vite) | `apps/instance` — operator and member interface |
| Project site | Astro 5 | `apps/project-site` — static HTML, React islands |
| Styling | Tailwind CSS v4 | CSS-first config, no `tailwind.config.ts` |
| Component primitives | shadcn/ui conventions | Owned source in `src/components/ui/` |
| Utility | `cn()` from `@/lib/cn` | `clsx` + `tailwind-merge` |
| Icons | Lucide React | Tree-shakeable |
| Variants | `class-variance-authority` | Button, Card, Badge, Avatar |
| Routing | React Router v7 | Client-side SPA routing |
| Auth | Cloudflare Access | Verified Access JWT with D1 user and membership linking |

**No webfont is loaded.** An instance must render identically offline and must
not call a font CDN on every page view. `--font-sans` prefers Inter when the OS
has it and falls back to the platform UI face.

---

## Token system

### Files

| File | Purpose |
|------|---------|
| `packages/brand/src/tokens.css` | CSS custom properties — the single source of truth |
| `packages/brand/src/presets.ts` | 7 church presets, `resolveTheme()`, `themeToCSS()` |
| `packages/brand/src/recipes.css` | Framework-free CSS for non-Tailwind consumers |
| `packages/brand/src/index.ts` | Barrel export — import from `@fellowship42/brand` |
| `apps/instance/src/globals.css` | Tailwind bridge, base layer, display utilities |

Colors are authored in **OKLCH** so the neutral ramp is perceptually even and
light/dark pairs stay balanced. The neutral ramp carries a slight warm cast
(hue ~70) at very low chroma — paper, not printer paper.

### Semantic tokens

Naming follows the shadcn/ui contract so those components work unchanged.
Extended tokens use the `--f42-` prefix.

```
Surfaces      --background  --card  --popover
              --f42-surface-sunken   (table headers, wells)
              --f42-surface-chrome   (header, sidebar)
Text          --foreground  --muted-foreground
Action        --primary / --primary-foreground     (fills)
              --f42-primary-text                   (AA-safe text weight)
              --f42-primary-hover  --f42-primary-soft
Status        --f42-{success,warning,danger,info}
              plus a -soft / -soft-foreground pair for each
Lines         --border          (decorative hairline)
              --f42-border-strong
              --input           (control boundary — meets 3:1, see below)
              --ring
Sidebar       --sidebar-*
Elevation     --f42-shadow-{xs,sm,md,lg,overlay,inset}
Charts        --f42-chart-1..8
Motion        --f42-ease  --f42-duration  --f42-duration-fast
Church        --church-{accent,accent-strong,accent-contrast,surface,ink,
                        radius,body-font,heading-font}
```

`--accent` follows the shadcn meaning — *hover/selected surface*, not brand
accent. Keeping that meaning is what makes ghost buttons and menu items behave
correctly.

Tailwind utilities are mapped in the `@theme inline` block in `globals.css`:
`bg-surface-sunken`, `text-brand-text`, `bg-success-soft`, `border-border-strong`,
`ease-brand`, and so on.

### Dark mode

Dark mode is a **selected** palette, not an inversion: surfaces get lighter as
they approach the reader, borders carry more of the separation work than
shadows, and the brand lightens so it stays legible on dark fills.

- Tokens live under `.dark, [data-theme='dark']` in `tokens.css`.
- `globals.css` declares `@custom-variant dark (&:where(.dark, .dark *))` so the
  `dark:` variant follows the class rather than `prefers-color-scheme`.
- `src/lib/theme-mode.tsx` owns the light/dark/system choice and persists it.
- `index.html` runs a small pre-paint script that mirrors `applyThemeMode()`.
  Without it, dark-mode operators get a white flash on every load.

Because everything is token-driven, almost no component needs a `dark:` utility.

### Accessibility gates

These are checked, not eyeballed. Re-check them if you change a token.

- **Text contrast.** Every foreground/background pair in both modes clears
  WCAG AA (4.5:1). The narrowest are `muted-foreground` on the sunken surface
  (5.21:1 light) and the destructive button (4.88:1 dark).
- **Control boundaries.** `--border` is a decorative hairline and is exempt from
  1.4.11. `--input` is the boundary of a control — the only thing telling a
  reader where a field is — so it is stepped to clear **3:1** against its
  surface. Do not set it back to the hairline value.
- **Focus.** One rule in the base layer: a 2px `--ring` outline with 2px offset.
  Outline, not a box-shadow ring, so it follows each element's border-radius.
  Components should not add their own focus treatment.
- **Chart palette.** See below — it has its own gate.

### Data visualization

`--f42-chart-1..8` is a validated categorical palette. **The slot ordering is
the colorblind-safety mechanism, not cosmetics.** Assign in fixed order; never
cycle, never generate a 9th hue.

Verified against this system's own surfaces (`#ffffff` light, `#1a1613` dark):
worst adjacent CVD ΔE 9.1 light / 8.4 dark, worst adjacent normal-vision ΔE
19.6 / 19.3. Two constraints ride along:

- Slots 3, 4, and 5 fall below 3:1 on the light surface — charts using them need
  direct labels or a table view.
- Only the first three slots clear the all-pairs gate. Scatter, bubble, and
  small-multiple forms cap at three series and fold the rest into "Other".

Do not reorder or re-step without re-running a palette validator against both
surfaces.

---

## 7 church presets

Churches select a preset in the admin panel; individual tokens can still be
overridden. Every accent clears 4.5:1 against white, and every surface clears
4.5:1 against its own ink.

| Preset | Accent | Surface | Radius | Body / heading | Character |
|--------|--------|---------|--------|----------------|-----------|
| **warm** | `#a8482a` terracotta | `#faf5ee` | rounded | serif / display serif | Welcoming, traditional |
| **calm** | `#2c6473` teal | `#f1f7f8` | soft | humanist sans | Peaceful, approachable |
| **bold** | `#9a2f18` deep red | `#f9f4f0` | sharp | neutral / modern sans | Energetic, contemporary |
| **classic** | `#2a4a7c` navy | `#f2f5fa` | soft | serif / display serif | Mainline, established |
| **modern** | `#2f3437` charcoal | `#f6f6f5` | sharp | neutral / modern sans | Minimal, urban |
| **forest** | `#256551` green | `#f0f7f3` | soft | humanist sans | Organic, nature-forward |
| **royal** | `#553184` purple | `#f6f2fa` | rounded | serif / display serif | Liturgical, high-church |

`resolveTheme()` derives `accentStrong` and `accentContrast` rather than storing
them. `accentContrast` is computed from luminance, so a church that picks a pale
yellow accent gets dark text on it instead of unreadable white.

### `themeToCSS(theme, { scope })`

- `scope: 'brand'` (default) — publishes `--church-*` only. Chrome stays neutral.
  Safe to wrap around operator content.
- `scope: 'surface'` — additionally remaps the semantic tokens so a whole region
  renders in the church's brand. For member-facing and published content, and
  for previewing what visitors see.

```tsx
// Operator screen: the church accent is available, chrome is untouched
<ChurchTheme theme={church.theme}>
  <span style={{ background: 'var(--church-accent)' }} />
</ChurchTheme>

// Member-facing region: fully branded
<ChurchTheme scope="surface" theme={church.theme}>
  <Hero variant="church">…</Hero>
</ChurchTheme>
```

### Adding a preset

1. Add the name to `BrandPresetName` in `packages/brand/src/presets.ts`.
2. Add the `ResolvedTheme` entry to `presets`.
3. Add it to `presetNames`.
4. Update D1 theme constraints or API validation if the preset is validated
   outside the brand package.
5. Run typecheck — the compiler catches missing cases.
6. Check the accent against white with `contrastRatio()` from the brand package.

---

## Component reference

### UI primitives (`apps/instance/src/components/ui/`)

Owned source code. Modify freely.

| Component | File | Notes |
|-----------|------|-------|
| `Button` | `button.tsx` | `default`, `secondary`, `outline`, `subtle`, `ghost`, `link`, `destructive`, `destructive-ghost` × `xs`, `sm`, `default`, `lg`, `icon`, `icon-sm`, `icon-xs`. Defaults to `type="button"`. |
| `Card` | `card.tsx` | `elevation` (`flat`/`raised`/`floating`), `padding`, `interactive`. Plus `CardHeader/Title/Description/Content/Footer/Divider`. |
| `Badge`, `StatusBadge` | `badge.tsx` | `StatusBadge` maps a domain status to a color via `statusVariants` — add statuses there, not at the call site. |
| `Table` | `table.tsx` | `TableContainer` + `Table/Header/Body/Row/Head/Cell/Meta/Actions/Footer/Caption`. Sticky header; `TableActions` reveals on row hover (`group/row`). |
| `Input`, `SearchInput` | `input.tsx` | |
| `Select` | `select.tsx` | Styled native `<select>` — keeps keyboard, mobile pickers, form submission. |
| `Textarea` | `textarea.tsx` | |
| `Field`, `FieldGrid`, `CheckboxField`, `FormActions`, `Label` | `field.tsx` | `Field` wraps its control in a `<label>` and handles hint/error/required. |
| `Tabs`, `Tab` | `tabs.tsx` | Segmented control with roving arrow-key focus. |
| `Avatar` | `avatar.tsx` | Deterministic tint from a name hash; initials wear a text token, not the hue. |
| `Skeleton`, `SkeletonTable`, `SkeletonCards` | `skeleton.tsx` | |
| `EmptyState` | `empty-state.tsx` | Icon, reason, and a next step. |
| `Separator` | `separator.tsx` | |
| `controlClass` | `control.ts` | The shared control treatment. Import this instead of hand-rolling a field class. |

### Product components (`apps/instance/src/components/`)

| Component | File | Purpose |
|-----------|------|---------|
| `AppShell` | `app-shell.tsx` | Sidebar navigation, church chip, theme toggle, user block, mobile drawer |
| `PageShell` | `page-shell.tsx` | Working-area container. `width="narrow"` for reading-heavy pages. |
| `PageHeader`, `Toolbar`, `ToolbarSpacer` | `page-header.tsx` | The standard head of every operator page |
| `Section` | `section.tsx` | Titled region with optional actions |
| `Metric`, `MetricRow` | `metric.tsx` | Stat tiles |
| `CardGrid` | `card-grid.tsx` | Auto-fill responsive grid |
| `Hero`, `HeroActions` | `hero.tsx` | Church-facing hero. Not for operator screens. |
| `ChurchTheme` | `church-theme.tsx` | Establishes church brand context |
| `Eyebrow` | `eyebrow.tsx` | Quiet orientation label |

---

## Routing: the church is not in the URL

One deployment is one church, so routes are flat — `/people`, `/groups`,
`/courses/:slug` — and the church comes from `useChurch()` in
`lib/church-context.tsx`. `BootstrapGate` already fetches `/api/bootstrap` and
refuses to render until it reports `configured`, so the identity is known
before any route mounts and costs no extra request.

Routes were previously `/churches/:churchId/...`. That made a single-church
product navigate like a tenant console: "Church" opened a list of one, which
opened another view of the same church. `concept/03-experience-principles`
requires the opposite — "the instance opens directly into the church it serves;
it does not feel like a generic multi-tenant selector."

`church_id` stays in the data model and on every API path; only the browser's
navigation collapsed. `/churches/...` URLs redirect to their flat equivalent,
and the preview harness covers that with a `legacy-redirect` route.

## Styling rules

1. **Tailwind utility classes only** — no custom class names outside the
   `globals.css` base/utilities layers and `recipes.css`.
2. **Use `cn()`** from `@/lib/cn` for conditional and merged classes.
3. **Reach for tokens, not raw colors.** No `bg-white`, no `text-gray-500`, no
   hex in a component. If a color is missing, add a token.
4. **Hover changes color, not position.** Nothing above a data table should move
   under the cursor.
5. **Headings label regions.** Display typography (`display-1`, `display-2`) is
   for church-facing and marketing surfaces only.
6. **`tabular-nums` is for columns.** The base layer applies it to `table` and
   `[data-numeric]`. A standalone stat-tile value uses proportional figures —
   tabular figures read loose at display sizes.
7. **Church-dynamic values** (`color-mix()`, `var(--church-*)`) use inline
   `style`, because Tailwind cannot know them at build time.

---

## API data model

The browser consumes camel-cased contracts from `src/lib/api-types.ts`. The
Worker maps D1 rows into those contracts in `worker/lib/records.ts`; route
components do not depend on SQL column names or Cloudflare binding types.

Primary records are churches, people, households, ministries, groups, courses,
lessons, events, sermons, media, and contributions. Each tenant record includes
`churchId`. D1 schema details live in `migrations/`.

### Access control pattern

Protected Worker routes use helpers from `worker/lib/auth.ts`:

- `requireCurrentUser(c)` validates an Access-backed D1 user.
- `requirePermission(c, churchId, permission)` enforces an active grant.

Public queries (church listings, published content) skip auth. Private
mutations and draft-content queries enforce church-scoped access.

---

## File structure

```
fellowship42/
├── packages/brand/src/
│   ├── tokens.css        <- CSS custom properties (canonical)
│   ├── presets.ts        <- church presets + resolveTheme() + themeToCSS()
│   ├── recipes.css       <- framework-free CSS for the Astro site
│   └── index.ts
├── apps/
│   ├── instance/          <- deployable church product
│   │   ├── index.html     <- pre-paint theme script
│   │   ├── migrations/
│   │   ├── worker/
│   │   ├── test/
│   │   └── src/
│   │       ├── globals.css
│   │       ├── main.tsx   <- ThemeModeProvider + Auth + Bootstrap + Router
│   │       ├── App.tsx
│   │       ├── lib/       <- cn, api, api-types, theme, theme-mode, format
│   │       ├── components/
│   │       │   └── ui/
│   │       └── routes/
│   └── project-site/      <- Astro project/community site
└── docs/ui-design-system.md
```

---

## Known follow-ups

The foundation and the highest-traffic routes were rebuilt together. These
routes work and inherit the new tokens, but still use card grids and ad-hoc
`<label>` markup where a table and `Field` would serve better:

- `events.tsx`, `groups.tsx`, `courses.tsx`, `sermons.tsx`, `media.tsx`,
  `contributions.tsx`, `course-detail.tsx`, `management.tsx`

`GroupRosterPanel` and `CourseEnrollmentPanel` are built on the new primitives
and mount inside those older pages, so a converted panel currently sits beside
unconverted card grids on the same screen.

Each has had its page header converted to `PageHeader` and its form controls
routed through `controlClass`. Converting their list bodies to `Table` and their
forms to `Field`/`Select`/`Textarea` is the remaining work.

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Neutral product chrome, church brand scoped | A ledger must be legible for every church, whatever preset they chose |
| OKLCH authoring | Perceptually even ramps; light/dark pairs stay balanced |
| No webfont | Offline parity and no font-CDN request per page view for a privacy-sensitive product |
| Table as a first-class primitive | A directory of thousands of people has to be scannable, aligned, and printable |
| Native `<select>` | Keyboard behaviour, mobile pickers, and form submission for free |
| Shared `controlClass` | Six routes previously each carried their own copy of the field styles |
| `StatusBadge` status map | "Published" is the same green on every list in the app |
| Dark mode via tokens, not `dark:` utilities | One place to change; components stay mode-agnostic |
| Outline focus, defined once | Follows each element's radius; no per-component offset colors |
| Validated chart palette | Colorblind safety is computable, so it is computed |
