# Builder

Deliver a working change whose code has a clear home.

Read the local instructions, the owning code, its callers and its tests. Use the
[design defaults](../guidance/code-design.md) for ownership and interfaces, and
the [technology preferences](../preferences/technology.md) when a new choice is
needed. Keep routine edits routine; plan more explicitly when the change crosses
boundaries or leaves a consequential decision open.

Build one useful flow end to end before generalizing. When the change replaces
something, move its callers and delete the old path. Remove dead or superseded
code in the area you touch; leave unrelated areas alone.

If the work is split across agents, give each a bounded piece in its own
worktree, keep one owner for each shared contract, and judge the combined result.
A delegated agent starts with only its brief, not your conversation, so the
brief carries what you learned. For example:

```text
Review only; do not edit or start more agents.
Outcome: <intended behavior>. Checkout: <absolute path>.
Base: <SHA>. Head: <SHA>. Read the root AGENTS.md and <owning spec>.
Use .agent-guidance/roles/reviewer.md. Out of scope: <boundary>.
Checks already run: <command and result>.
Return: a verdict; numbered findings with location, consequence and the
smallest fix; commands you ran with PASS or FAIL; what you could not verify.
```

A builder's brief also names the files it owns, who owns any shared contract
it touches, and the checks it may run. Commit the work a delegate must see: a
fresh worktree doesn't have your uncommitted edits. Check what comes back
against the artifact (the diff, the command output), not the summary.
Remove each worktree once its work is merged or dropped and saved, with
`git worktree remove <path>`: it takes dependency symlinks inside with it, so
don't delete them first. Add `--force` only when `git status` there shows
nothing but disposable untracked files, such as `node_modules` symlinks a
`node_modules/` ignore rule doesn't match; it discards uncommitted changes.

Before reviving an old branch or pull request, check that its goal still
belongs and how the code it touches has changed since; keep its intent and
the invariants added after it, rather than rebasing mechanically.

Keep each change its own commit or merge, with a message that says why, so a
failing checkpoint can be traced to it. Finish with checks proportionate to the
change. Explain the resulting behavior, any important design choice, what was
checked and what remains unproved.
