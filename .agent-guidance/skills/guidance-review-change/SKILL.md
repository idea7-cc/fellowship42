---
name: guidance-review-change
description: Review code changes for defects, unclear ownership, hidden effects and leftover old paths. Use for a requested code review or assessment; not prose review or automatic review stages.
---

# Review a change

Read the requested change, its callers, relevant tests, and project instructions.
If available, use `.agent-guidance/guidance/code-design.md` to interpret the
maintainability preferences. Fit the project's actual conventions and intended
behavior; do not impose an unrelated architecture.

Judge findings by consequence. Broken behavior, a missed invariant, a security
gap or a meaningful verification gap matters. So does structure that makes a
likely next change harder: unclear ownership, duplicated policy, scattered
feature logic, hidden effects or ordering, speculative machinery, and old paths
left beside their replacements. While the project is iterating, structural
problems usually outrank rare edge cases. Follow the affected paths far enough
to support each finding, and distinguish evidence from uncertainty. Do not use
line counts or prescribed layers as a substitute for this assessment.

For each material finding, give the location, consequence, and a practical
correction, and say whether it belongs in this change or can follow. Do not
report stylistic preferences as defects. If there are no material findings,
say so and describe any meaningful limits of the review.

If a finding shows a repeated agent mistake that shared guidance could prevent,
say so in one line.

Keep the review within the requested scope. Do not automatically rewrite the
code, install guidance, launch another agent, or add a mandatory review stage to
future work.
