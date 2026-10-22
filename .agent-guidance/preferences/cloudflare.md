# Cloudflare preferences

As of 2026-10-22, checked against Cloudflare's
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
(last updated 2026-10-12), Wrangler configuration (2026-10-20), testing
(2026-10-18), the Rules of Durable Objects (2026-10-18) and
[`cloudflare/skills`](https://github.com/cloudflare/skills) at `86505e4`. When
one of those pages shows a newer "Last updated" date, read it before relying on
this file, and tell the owner where they disagree.

Cloudflare's documentation and skills own the details and change often; your
training may predate them. Retrieve them rather than working from memory:

- Cloudflare's `workers-best-practices`, `wrangler` and `durable-objects` skills
  from `cloudflare/skills`, when the host has them.
- The documentation MCP server at `https://docs.mcp.cloudflare.com/mcp`, or a
  product's `llms.txt`, listed at `https://developers.cloudflare.com/llms.txt`.

This file records the choices those sources leave open or that matter most.

| Area | Preferred choice | Why / tradeoff |
| --- | --- | --- |
| Configuration | `wrangler.jsonc` as the source of truth, with a current `compatibility_date` and `nodejs_compat` | Newer settings are JSON-only. Use today's date for a new Worker; move an existing Worker's date forward at a checkpoint and run its tests |
| Binding types | `wrangler types`, committed and checked with `wrangler types --check` in CI | Never hand-write `Env`. `@cloudflare/workers-types` remains for typing shared libraries |
| Platform access | Bindings for D1, R2, KV, Queues and Workflows; service bindings between Workers | A REST call from a Worker adds a network hop and a credential the binding doesn't need |
| Sites and apps | Workers with Static Assets | Cloudflare directs new projects to Workers rather than Pages |
| Background work | Queues for independent messages, fan-out and batching; Workflows for multi-step work that keeps step results, waits for events or sleeps | A Queue can feed a Workflow when both apply. Queues deliver at least once, so consumers must be idempotent |
| Coordination | SQLite-backed Durable Objects, one per coordinated unit such as a room, document or tenant | One global object caps throughput. Add them when coordination warrants them |
| Observability | Workers Logs and Traces on, logs as JSON objects, sampling set per workload, source maps uploaded | `observability.enabled` doesn't turn on traces; set `observability.traces.enabled` as well |
| Runtime tests | `@cloudflare/vitest-plugin` on Vitest 4.1 or later; `createTestHarness()` for tests across whole Workers | The plugin replaced `@cloudflare/vitest-pool-workers` with the same API; Cloudflare's codemod moves a project |
| Secrets | `wrangler secret put`; `.dev.vars` or `.env` locally, ignored by Git | Never in `vars`, configuration or source |

Record a project's actual bindings, commands and compatibility date in the
project.
