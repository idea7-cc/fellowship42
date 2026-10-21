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
Remove each worktree once its work is merged.

Keep each change its own commit or merge, with a message that says why, so a
failing checkpoint can be traced to it. Finish with checks proportionate to the
change. Explain the resulting behavior, any important design choice, what was
checked and what remains unproved.
