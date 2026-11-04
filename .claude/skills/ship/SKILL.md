---
name: ship
description: Carry a change to its finish, a ready pull request or a merge, and own what arrives after. Use when the owner says "ship", "ship ready" or "ship merge", or asks you to take work all the way through; not for planning or reviewing alone.
---

# Ship a change

Take a change from working code to its finish, and stay with it until the
results that arrive later have been handled.

## 1. Work out the finish

- `ship merge`: merge once the proof below passes.
- `ship ready`: stop at a ready pull request; the owner merges.
- `ship` alone, or no keyword: merge if the owner approved a plan for this work
  ("let's do it", "good plan, let's build it") or asked for a merge, unless
  they said they'd review first or choose when to merge. Otherwise stop at a
  ready pull request.

A project's own rule about who may merge comes first. Start by stating the
finish and what authorizes it in one line. Ask the owner only about a step the
approval didn't cover that would change product direction, authority or a
support promise.

## 2. Prove it

Choose the proof from what the diff changes, not from habit.

- Pick the tests the diff reaches before running any, using the project's
  command for that where it has one. Rerun only failures, then run the
  project's fast gate once.
- A changed shared runtime path, interaction between processes or stored
  format gets one direct run of that path, by the project's command where one
  exists. One narrow run, not the slow suite.
- Run slow suites where the project puts them: at its checkpoints.
- Start an independent review, by a reviewer that didn't build the change, at
  a checkpoint and for a change whose mistakes would be expensive: a new module
  boundary, a pattern others will copy, or anything touching content, secrets
  or authority. Hold the merge for it only when the change could lose content,
  leak a secret or bypass an authority check; otherwise merge and fold its
  findings in, but receive them before you report done.
- A failure the change can't cause doesn't hold it up: check it on the target
  branch, report it and carry on.

## 3. Open the pull request

Write it problem first: what was wrong or missing, what changed, what you
checked, and what remains unproved. Keep it short. Open it ready for review
unless the project says otherwise.

## 4. Follow through

If your tool offers a pull request watcher or durable background tasks, use
them, so the work continues after your turn ends; don't poll in a sleep loop.
On each change:

- A failed check: fix it if the change caused it; otherwise treat it as above.
- A review comment or bot finding: check it against the source, then fix it or
  answer it. A new push doesn't settle an earlier finding.
- The same kind of finding coming back after a fix: stop patching and
  reconsider the design.

## 5. Before merging

Fetch the current target branch. If it moved into the change's dependencies
since your checks ran, update the branch and rerun the checks the combination
reaches; a clean merge status doesn't show the combined code works. Merge only
when the checks pass and every finding is fixed or answered, using the
project's merge method. Then remove the worktree.

## 6. Report

End with a short report:

- Finish reached: the pull request link, and merged or ready.
- Checks run and their results, including any direct run.
- Time spent waiting on checks or review, and each time the owner had to step in.
- What remains unproved, and any open follow-up with who now owns it.
