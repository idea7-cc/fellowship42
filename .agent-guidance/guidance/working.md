# Working defaults

Deliver the requested outcome with code that is easy to read and change. The
task and the project's own instructions come first; these are defaults.

- Read the owning code and its callers before changing it. Give each behavior
  and each kind of state one clear owner. Keep related logic together,
  interfaces small, names concrete, and persistence and external calls visible.
- Take the smallest complete change: leave out what the task doesn't need, then
  reuse existing code, the platform and installed dependencies before writing
  new code. Avoid generic helper buckets, pass-through layers and speculative
  extension points. A focused refactor is often the simplest complete change.
- When you replace something, update its callers and delete the old path in the
  same change. Keep compatibility only for consumers the project's stage
  statement names; without one, ask before breaking something people use.
- Treat confusing ownership, duplicated policy and leftover old paths as defects
  when they'd make the next likely change harder, even if tests pass. Name the
  consequence and the fix; a different taste is not a defect.
- Make routine reversible decisions and keep going. Ask before changing product
  direction, authority or a support promise. Protect other people's work,
  secrets and real content.
- Work on a branch, never main; push every commit so a broken machine loses
  nothing. Merge once the owner accepts: in GitHub, in chat or by an approved
  plan once checks pass. Remove a worktree once its branch is merged or dropped;
  builds reach tens of gigabytes.

## Verify in proportion

Check what the change could break, with the cheapest check that would catch it.

- Code changes: pick the tests your diff reaches before running any, rerun only
  failures, then run the fast gate (lint, types and unit tests by default) once.
  Look at user-visible results. Keep main green on that gate. Add a test for a
  meaningful failure, not one that restates the implementation.
- Slow suites, other platforms, live runtimes and the review seat belong at
  checkpoints: a release, a build others will use, the end of a batch, a spike
  whose experiment is the test, and any the project declares. Run those its
  changes bear on. Don't wait on the review seat; fold in its findings. A build
  for whoever directs the work, which they can undo, is tested by their use. Keep
  CI within budget. When a checkpoint fails, fix the change that broke it, and
  move a check that would have caught it sooner into the fast gate.
- Breaks you can't take back: either make the effect reversible and check that
  the undo works, or prove before it takes effect that it won't break. Take the
  cheaper one, never both, and say which and why.
- A failure the change can't cause doesn't hold it up: confirm it's unrelated,
  report it and carry on.

When you predict a cheaper way to the same confidence, take it and say so.

## Examples

- A button label: check the rendered wording. No plan document, no extra reviewer.
- A docs or comment change: check its syntax and links; code tests can't catch
  what it breaks. A CI change: check which events and jobs will run.
- A new operation used by two interfaces: one definition and implementation,
  thin callers, focused tests.
- A data format no supported consumer relies on: change it, update readers and
  writers, rebuild fixtures and test data. No compatibility layer.
- Replacing stored data in place: keeping the previous copy and testing its
  restore is often cheaper than proving every import path is safe.

Later stages add the checkpoints a project declares: real-runtime checks for a
capability being validated, release checks before customers rely on it.

Report what changed, what you checked and what's unproved, linking files by
absolute path. Don't create plans, contracts or decision records for routine
work; leave a short note only when another session needs it.
