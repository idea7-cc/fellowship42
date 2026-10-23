# Model preferences

Model choices change over time. Keep them separate from role expectations and
choose them in the agent launcher or T3 Code. This file is a quick reference, not
a routing engine.

| Work | Preferred model | Alternative | When to choose / known limitation |
| --- | --- | --- | --- |
| Routine implementation | Claude Opus 5.5 (`claude-opus-5-5`), medium effort | Claude Sonnet 5.5 (`claude-sonnet-5-5`) for bounded UI or script work | Bounded, settled edits |
| Read-only search, diagnosis, triage and log summaries | Claude Haiku 5.5 (`claude-haiku-5-5`) | Sonnet 5.5 | Check its conclusion before acting on it. Not for authority, persistence or spec work |
| Substantial implementation | Claude Opus 5.5 (`claude-opus-5-5`), high effort | Opus at xhigh | xhigh for hard contract, authority, persistence or concurrency work |
| Substantial design or ambiguous problem | The current session's model | GPT-6.1 Sol (`gpt-6.1-sol`), xhigh, for a second opinion | Sol tends toward caution; weigh its added gates and tests against the project's stage |

Review, requested or at a checkpoint, is the [review seat](review-seat.md).

Never run above xhigh effort; never use max or ultra. Recorded by CT, 2026-10-16.

## Delegating

Run independent work in parallel; waiting on a step the next one doesn't need
costs time and tokens. Resume an agent for follow-ups to its own work while its
cache is warm. Start new work with a fresh agent and a short brief that points
at files, because a long transcript is reread on every turn. Keep large files
and logs out of the lead's context: delegate the reading and take back the
conclusion.

## Selection and updates

These are defaults, not role ownership. The current session writes its own plans
and documentation; a preference never requires delegating them. If a preferred
model is unavailable, use an available one suited to the task and say so once.

When a confirmed newer successor to a saved choice appears in the launcher's
catalog, ask once whether to update the default, with a brief reason. Keep the
saved choice until the owner decides. A different model family or a larger model
is not necessarily a successor.

A new model or a substantial harness change is a good moment for the owner to
review this library.
