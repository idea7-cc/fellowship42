---
name: guidance-design-change
description: Design substantial code changes, new module boundaries or significant technology choices. Use for requested architecture or design; routine edits need no separate workflow.
---

# Design a change

Produce an implementable approach that fits the project and remains easy for a
new reader to understand. Keep the process proportional to the change.

Read relevant project instructions, code, and tests. If the project has an
`.agent-guidance/` snapshot, consult its code-design guide, selected blueprint,
and technology preferences when they affect this decision. Treat them as defaults;
the project's actual choices and explicit task instructions take precedence.

Identify the owning feature before proposing files. Describe its public inputs,
results, important invariants, and observable errors. Keep business decisions
cohesive; make persistence, provider calls, and sequencing visible at a boundary.
Prefer extending an existing owner over adding a generic helper collection.

Before proposing new code, consider what the task can omit, then existing project
code, standard library or platform features, and suitable installed dependencies.
Use the first option that fully meets the task. Keep the remaining implementation
clear; avoid pass-through layers and speculative reuse. Include affected callers,
tests, fixtures, configuration and exports, preserving necessary validation,
data-loss handling, security and accessibility.

Say what the change replaces and who relies on it. Move callers and remove the
replaced path in the same change; keep compatibility only for consumers the
project says it supports.

Explain alternatives only when the tradeoff matters. Raise unresolved consequential
choices; use judgment for ordinary reversible details. Do not expand the requested
scope, introduce an orchestration system, or imply permission for additional actions.

The result should make the behavior, ownership, affected boundaries, and useful
verification obvious. A short explanation or sketch is often sufficient; create
a separate design document only when requested or materially useful.
