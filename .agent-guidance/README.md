# Project guidance snapshot

wayof7 resolved this snapshot for the project. Don't edit it here: change shared
guidance in wayof7, or the project's choices in `project.json`.

The marked section of the project's AGENTS.md says when to read each item.
`source.json` records the source revision, the items and their hashes.

## Items

- `code-design` (principle, on-demand): Where code belongs, small interfaces, visible effects, replacing old paths and truthful contracts. Read it when designing or reviewing code.
- `proportional-verification` (principle, on-demand): Where expensive checks go (a fast gate per change, the rest at checkpoints), how to protect against breaks you can't take back, the review seat, and how proof grows by stage. Read it when deciding what to check before merging or at a release.
- `working` (principle, always): How agents work by default.
- `models` (preference, on-demand): Preferred models for kinds of work. Read it when choosing a model.
- `review-seat` (preference, on-demand): Who fills the independent, adversarial review seat. Read it when a change needs that review; a project may override it.
- `technology` (preference, on-demand): Preferred stacks and providers. Read it before choosing a technology.
- `builder` (role, on-demand): What good building work looks like.
- `planner` (role, on-demand): What a useful plan for a substantial or ambiguous request looks like.
- `reviewer` (role, on-demand): What a useful review looks like.
- `web-app` (blueprint, on-demand): A starting shape for a web application or content site.
- `guidance-design-change` (skill, on-demand): Design substantial code changes, new module boundaries or significant technology choices. Use for requested architecture or design; routine edits need no separate workflow.
- `guidance-review-change` (skill, on-demand): Review code changes for defects, unclear ownership, hidden effects and leftover old paths. Use for a requested code review or assessment; not prose review or automatic review stages.
- `references` (reference, on-demand): The sources these ideas build on.
