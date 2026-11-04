# T3 Code

As of 2026-11-04, checked against T3 Code `v0.1.7-nightly.20261104.4151` and
[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code) main at `d51bc58f`.
T3 Code ships nightly and injects its own instructions for its tools into each
session; those instructions own the mechanics and win over this file. This
file records which T3 feature serves which part of the way of working, so an
agent reaches for the right one.

Keep T3's tool protocol out of shared guidance and skills: they name the
outcome ("use the harness's pull request watcher") so they still work in other
agents.

| Job | Use | Why / limitation |
| --- | --- | --- |
| Work that outlives the turn | T3's durable delegated tasks, not a background agent of the provider's own | A provider's background agent can die when the parent turn ends; T3's task reports back to the thread |
| A delegated agent's context | A brief that carries what the lead learned: outcome, checkout, base and head, owned files, guidance to read, checks run, what to return | The child gets only its task, not the parent's history. Project instruction files still load normally |
| Review in another vendor's model | A new delegated task on that provider for each review round | Resuming a review agent carries the last round's conclusions into the next |
| Following a pull request | T3's pull request watcher, then a decision on each wake | The watcher reports checks, remarks, head changes and conflicts. A clean conflict status doesn't show the combined code works: fetch the target before merging |
| Project commands | The project's own runner (`package.json`, `mise`, a script) for the fast gate, affected tests and direct checks; `t3.json` `scripts` to offer them in T3's actions menu | `t3.json` scripts are for people and hooks, not tools an agent calls. Name the commands in `AGENTS.md` too |
| Worktree setup | A `t3.json` script with `runOnWorktreeCreate: true` and `async: false` that selects the runtime and installs dependencies, imported into the project's actions | `t3.json` only offers its scripts: import the setup from the actions menu's "From t3.json" group, or nothing runs. Without `async: false` the agent starts while setup still runs. Test it in a freshly created worktree, not by reading it |
| Pinned runtimes in T3's shell | A project script that puts the pinned runtime's bin directory first on PATH, such as `scripts/pinned.sh pnpm verify` | In T3's shell, `mise exec` runs the named tool but leaves the system Node ahead of the pinned one for the processes it starts (mise 2026.10.25, checked 2026-11-04) |
| New-thread default | `defaultThreadEnvMode` in `t3.json`, or T3's project settings | Per-project model and effort defaults live in T3's project settings; keep the reasons in the model preferences |
| Skills | Project skills in `.agents/skills/` and `.claude/skills/`, invoked from the slash menu or a `$` mention | Restart the session after a sync changes skills. A user-level Claude skill with the same name shadows the project's |
| Recurring reports | T3's scheduled tasks, read-only | A report surfaces what needs a decision; it never accepts guidance changes or merges |
| A visual answer or report | Render the HTML in the thread | Charts and briefs read better rendered than as terminal text |
| A tour of a pull request's design for the owner | T3's pull request review guide | It explains intent and design and doesn't hunt bugs, so it complements the independent review seat, never fills it |

`t3.json` has no field for agent instructions: keep them in `AGENTS.md`, with a
`CLAUDE.md` that imports it.
