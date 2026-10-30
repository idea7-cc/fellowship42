# Proportional verification

The working defaults list the everyday checks. This explains where the expensive
checks go and how proof grows as a project moves through its stages. A project
states its stage in its own instructions; nothing here changes it.

## Per change and at checkpoints

The working defaults put the fast gate on every change and the rest at
checkpoints. That works because a well-structured project can take many changes
quickly, then find and fix the few that broke something; proving nothing broke
after every change costs more than it saves. The fast gate takes minutes, not
hours, so parallel work never builds on a broken base. A checkpoint failure
stays cheap to fix while each change is its own commit or merge, so the batch
can be bisected, and while tests pin contracts rather than restating the code.

A delegated builder's brief names the checks it may run: the tests for the code
it touches while it works, and the fast gate once at the end. Checkpoint suites
run once, at the checkpoint, not in every change of the batch.

When a build is tested by the use of whoever directs the work but the undo
can't protect what that use touches (real content, accounts, messages sent),
try it first in a sandbox with its own data and development accounts.

## Choosing what to run

Most wasted test time comes from running the wrong thing, not from running too
little.

- Choose from the diff before running anything: the tests its imports reach, and
  the tests in the slower tiers (live, end-to-end, installed-app) that call a
  contract it changed. Prefer a project command that lists them over judgement:
  an agent tends to pick the tests that confirm its patch. Static selection
  misses a test that reaches the change through a process, a dynamic import or a
  fixture, which is what the fast gate, run once at the end, is for.
- Update a slower tier's tests in the change that breaks them. A suite nobody
  runs per change rots quietly, and the next change to run it pays for the
  debugging.
- While fixing, rerun only what failed; run the full gate once, when the change
  is ready.
- Before debugging a slow suite's failure, run that test on main. A failure
  there isn't the change's: report it and fix it apart.
- A skipped test is not a pass. Know which tests the gate skips, and where: a CI
  runner or a worktree without the inputs they need.
- Put build order in scripts, not memory: a test that needs a built output
  builds it or says it is stale, and a packaging chain is one command.
- Run one heavy job at a time on a shared machine: parallel suites fail timing
  tests, and a build that rewrites outputs breaks the other run. Record a test
  known to fail only under load, so nobody diagnoses it again.
- A backlog of stale tests suits a delegated builder in its own worktree while
  the lead carries on. Its brief names the tests to repair; it doesn't choose
  what proves the lead's change.

## Breaks you can't take back

Some breaks can't be fixed after the fact by finding and reverting a change:
lost content, a leaked secret, a bypassed authority check, a message already
sent. Protect against them in one of two ways:

- Make the effect reversible and check that the undo works: keep the previous
  copy and test its restore, ship to a channel whose users want the bleeding
  edge and can roll back, queue sends so they can be cancelled.
- Prove before it takes effect that it won't break.

An undo nobody has exercised is a claim, not protection, so check the undo
itself, and check it again at checkpoints. When your prediction of the cheaper
path turns out wrong, note it in the project's evidence notes.

## The review seat

The review seat is an independent, adversarial review: a reviewer that didn't
build the change reads it and tries to break it, using the
[reviewer role](../roles/reviewer.md). It sits at checkpoints and on changes
whose mistakes would be expensive: a new module boundary, a pattern others will
copy, or anything touching content, secrets or authority. One review of a batch
can cover many small changes.

The review seat doesn't hold the work. Merge on the fast gate and keep going
while it reads the batch, then fold its findings into the next change. Hold a
merge for it only when the change could lose content, leak a secret or bypass an
authority check.

The reviewer reports; whoever leads the change decides what to fix, and says
why for any finding it leaves. The lead checks that each fix landed; send it
back for another review only when the fix is as large as the change. Who fills the seat is a preference
([review-seat](../preferences/review-seat.md)). A project that needs a
different occupant overrides that item with a reason.

## CI budget

Each project has a monthly CI budget: US$7 unless its manifest sets `ci_budget`
in `.agent-guidance/project.json`. Sync shows it to the project's agents, and
the inventory shows it beside the project. Count a project's CI at its runners'
list price; the free minutes a provider includes for the whole account are a
shared cushion, not part of any project's budget.

Checks run locally cost no CI budget, and a project may name a local command as
its fast gate. Keep per-change CI to the fast gate, and run jobs that cost a
multiple, such as other platforms or long installed-app suites, at checkpoints
or on demand. When you expect work to take the month's CI past the budget, say
so before you start, with your estimate.

## What a project declares

In its own instructions, a project names what differs from these defaults: its
fast gate, its checkpoints, any release channels, and who may merge. Its CI
budget goes in its manifest. Without them, an agent uses the defaults above.

## Iterate: nobody relies on it yet

The question is whether the change is useful and its code is clear.

- Checkpoints are few: usually a build others are about to use.
- Add a test when it pins down an important contract or a failure you just fixed.
  Don't hold a merge to prove that the test would have failed on the old code.
- Delete tests for behavior you removed. Change a test when the intended
  behavior changed, and say so.
- Fix structural problems before spending time on rare edge cases. Problems that
  could lose real content, leak a secret or bypass an authority check still
  need a working fix.
- Don't build release machinery, migration paths or compatibility suites.

## Validate: a capability is chosen for real use

The question is whether it works across its real boundaries.

- The capability's run in its real runtime, with its providers, packaging and
  platforms, is a checkpoint.
- Check the failures it depends on: interruption, retry, concurrency, recovery.
- Measure performance or accessibility where the capability claims them.
- Fix important structural problems before investing in expensive proof.

## Support: customers rely on a release

The question is whether identified consumers can rely on this artifact.

- Every release candidate is a checkpoint. Run the project's declared release
  checks against the artifact you will ship, and promote that same artifact.
- Channels let the risk-tolerant take a build sooner: a bleeding-edge channel
  can ship on the fast gate with a tested rollback, while the stable channel
  waits for the full checkpoint.
- Keep supported contracts working for their declared window, or ship an
  explicit migration exercised against existing data.
- Check upgrade, rollback and recovery on the supported environments.

## Honest results

A claim covers only what was actually checked. A skipped, blocked or failed
check stays exactly that. A pass obtained by hiding a defect or quietly dropping
promised behavior is not a pass.
