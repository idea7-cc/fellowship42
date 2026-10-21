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
  when they would make the next likely change harder, even if tests pass. Name
  the consequence and the fix; a different taste is not a defect.
- Make routine reversible decisions and keep going. Ask before changing product
  direction, authority or a support promise. Protect other people's work,
  secrets and real content.
- Remove each worktree you create once its branch merges or is dropped, after
  pushing what isn't merged; its build output can reach tens of gigabytes.

## Verify in proportion

Check what the change could break, with the cheapest check that would catch it.

- Code changes: the project's fast gate (lint, types and unit tests unless it
  names another) and the tests for the code you touched, and look at the result
  when it's user-visible. Keep the main branch green on that gate. Add a test
  for a meaningful failure, not one that restates the implementation.
- Slow suites, other platforms, live runtimes and the review seat belong at
  checkpoints: a release, a build someone will use, the end of a batch, a spike
  whose experiment is the test, and any the project declares. Keep CI within
  the project's budget. When a checkpoint fails, find the change that broke it
  and fix exactly that.
- Breaks you can't take back: either make the effect reversible and check that
  the undo works, or prove before it takes effect that it won't break. Predict
  which is cheaper and faster for this change and take that path; don't build
  both, and don't take the costlier one out of habit. Say which you chose and
  why in one line where you report the change.
- A failure the change can't cause doesn't hold it up: confirm it's unrelated,
  report it so it gets fixed, and carry on.

These are defaults. When you predict a cheaper way to the same confidence, take
it and say so.

## Examples

- A button label: check the rendered wording. No plan document, no extra reviewer.
- A docs or comment change: check its syntax and links; code tests can't catch
  what it breaks. A CI change: check which events and jobs will run.
- A new operation used by two interfaces: one definition and implementation,
  thin callers, focused tests.
- A confusing internal API: replace it, update the callers, delete the old one.
- A data format no supported consumer relies on: change it, update readers and
  writers, rebuild fixtures and test data. No compatibility layer.
- Replacing stored data in place: keeping the previous copy and testing its
  restore is often cheaper than proving every import path is safe.

Later stages add checkpoints when a project declares them: real-runtime checks
for a capability being validated, and the declared release checks before
customers rely on it.

Report what changed, what you checked and what remains unproved. Don't create
plans, contracts or decision records for routine work; leave a short note only
when another session will need it.
