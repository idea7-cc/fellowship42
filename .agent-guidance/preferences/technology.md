# Technology preferences

These are personal defaults for new choices, selected from the project review
on 2026-10-13. Use an existing project's adopted stack first. A shared preference
update is not a request to migrate it.

| Area | Preferred choice | Why / tradeoff | Acceptable alternatives |
| --- | --- | --- | --- |
| Language and runtime | TypeScript for web apps and APIs; Workers for web APIs, Node for local tooling | Keep the tooling runtime distinct from the deployed runtime | An existing project's adopted runtime |
| Application UI | React + Vite | Interactive applications; follow the router's native conventions | Existing React Router or Svelte applications |
| Content websites | Astro | Choose static or on-demand rendering from the content contract | An existing project's adopted framework |
| Managed publishing | EmDash when a CMS is needed | Reuse its publishing capabilities | Static content when a CMS adds no value |
| Routing and server state | TanStack Router and Query when useful | Typed routing and server-state coordination | The project's adopted router and data client |
| Desktop framework | Electron for apps sharing a React/TypeScript UI across platforms | Reuse the web UI with a consistent Chromium renderer; weigh package size and native integration needs | An existing project's toolkit; evaluate other toolkits when constraints differ |
| API framework | Hono on Cloudflare Workers | A small HTTP surface for human and agent clients | An adopted Convex backend or other existing API |
| Service workflows | Effect 4 for substantial TypeScript services | Typed failures, explicit dependencies, cancellation and concurrency; keep durable operation state explicit | Plain TypeScript for small operations; native framework transactions |
| Data and storage | See the workload map below | Choose by authority, data shape and coordination needs | Preserve the project's adopted store |
| Hosting and deployment | Cloudflare Workers for new web projects when the workload fits | Account for Worker runtime and provider constraints; tag the project `stack:cloudflare` to receive the Cloudflare preferences | Existing hosting; other runtimes when the workload warrants them |
| Validation | Native framework validators; Effect Schema for Effect-owned contracts; Zod for other general TypeScript boundaries | Infer types from the authoritative schema; avoid parallel definitions of the same contract | Existing validation with one clear source of truth |
| Authentication | Unset | Include managed versus self-hosted preference | Unset |
| Email and notifications | Unset | Include delivery needs and provider boundary | Unset |
| UI components and styling | Unset | Include accessibility and customization needs | Unset |
| Formatting and lint | Biome by default; framework tooling where needed | Check supported file types and required rules; keep responsibilities clear when combining tools | ESLint and Prettier when framework support or specific rules warrant them; existing project tooling |
| Package manager | pnpm for new TypeScript apps and workspaces | Shared dependency storage and explicit package boundaries; pin its version and commit the lockfile | npm when minimal setup matters; an existing project's package manager |
| Dependency maintenance | Knip for periodic dependency cleanup; a small preferred dependency set | Review unused-dependency findings, especially around dynamic loading; use the choices in this catalog before adding another library | Existing cleanup tooling; native framework capabilities |
| Testing | Vitest for apps and services; Node's built-in test runner for small Node utilities | Run Worker behavior in the Workers runtime; choose versions compatible with the runtime and test integrations | Existing test suites; browser checks for relevant user flows |
| Logging and observability | Workers Logs and Traces on Cloudflare; otherwise unset | Include operational needs and data ownership | Unset |

## Storage by workload

| Situation | Preferred choice | Scope / tradeoff |
| --- | --- | --- |
| Relational authority in a Cloudflare app | D1 | Drizzle is an option for SQL schema and migrations |
| File bytes and media | R2 | Keep authorization and record metadata in the owning data store |
| Realtime state or coordination needing one owner | Durable Objects | Add when coordination warrants them, one per coordinated unit |
| An adopted reactive Convex backend | Convex | Preserve native transactions, validators and generated API references |
| Core7's embedded local store | Turso Database engine | Adopted in Core7; evaluate elsewhere. This means the embedded engine, not Turso Cloud |

## Dependency choices

Reuse the project's adopted building blocks before adding another package for
the same purpose. Prefer a dependency that earns its place through useful
capability, maintenance and runtime compatibility. Consider its transitive
dependency footprint as well as the direct package; a short manifest alone
does not establish a small or trusted dependency set.

For pnpm workspaces, catalogs can keep chosen versions in one place. They are
version coordination, not a trust assessment. Keep actual versions and the
lockfile with the project. Use Knip periodically to identify cleanup candidates,
and review findings before removing packages.

Consider pnpm's explicit dependency build-script permissions and release-age
settings when adopting its install configuration. Record intentional exceptions
in the project. These controls complement dependency review rather than proving
that a package is safe. Keep Node as the default tooling runtime; adopting an
installer does not require changing the runtime.

## How an agent should use this

Use the actual project's stack first. For a new project, consult this catalog and
the selected blueprint. If a choice is unset, use task context and a modest,
well-understood option; ask when the choice has consequences the user should
weigh. Explain a meaningful departure briefly in project context or a decision note.

Record a project's adopted products, versions, commands, and provider constraints
in that project. Keep credentials in the project's normal secret mechanism, never
in this library. A shared preference update applies to future choices; it does not
authorize changing a working project's stack.
