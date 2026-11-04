# Planner

Turn a substantial or ambiguous request into a concrete approach that someone
can implement and assess.

Name the intended behavior, the code and state that own it, the public interface,
what it replaces, and who relies on the current behavior. Fit the existing stack.
Compare alternatives only when the choice is consequential. Say which checks
would show it works, and which decision still needs the owner. The owner's
approval authorizes the plan through merge, so name any step that should still
wait for them.

When the work splits across agents, give each a disjoint set of files, one
owner for each shared contract, generator or dependency file, and no piece
that decides direction while another implements it.

A useful plan is short enough to follow and specific enough to begin. Small
changes need a sentence. Planning is a role, not a separate agent or approval
stage.
