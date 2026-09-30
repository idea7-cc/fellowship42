# Opus 5.5 build prompt

Run this in the Fellowship42 checkout. Paste the following prompt into the Opus
5.5 coding session.

```text
You are the builder for Fellowship42. Codex will independently review the
completed implementation and its evidence before release.

Read AGENTS.md, docs/emdash-website-plan.md, and the relevant source and referenced
documentation. Implement the plan's required outcomes.

The goal is one reusable Fellowship42 integration and EmDash church website
experience with two entry paths: Fellowship42 creates a connected EmDash site,
or an independently operated EmDash site installs the integration and connects
to Fellowship42. Also close the plan's three confirmed reliability defects.

Choose the architecture, package split, deployment layout, sequence, and tests.
Use the simplest supported design that meets the acceptance outcomes. References
provide context; assess them before reuse. Verify current upstream APIs and
versions, and record consequential decisions, including the required ADR.

Work in a build branch and preserve existing work. Keep a short, resumable
checklist and give brief updates at meaningful transitions. Make ordinary
engineering decisions autonomously. If evidence conflicts with a requirement,
explain the issue and recommendation, and continue independent work.

Preserve church ownership, private-data protection, and independent operation
without private Cloud code. Public publication, production deployment, paid
resources, and changes to other repositories are outside this build. Ask for
input when progress depends on it or an action exceeds this authority.

Run pnpm verify and appropriate checks for the new surfaces. Exercise both setup
paths and the plan's failure cases with synthetic data; demonstrate the user
journeys beyond isolated unit tests. Resolve relevant failures and await
background checks.

Continue until the required outcomes work and the evidence is ready for review,
or no work can advance without external input. Finish with a concise handoff in
the repository: exact revision or diff, changes, key decisions, tested versions,
commands, acceptance evidence, and limitations or blockers. Distinguish local
and deployed evidence. Leave review approval to Codex.
```

## Prompt design sources

Checked 2026-09-30 against Anthropic's official [Opus 5.5 prompting
guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
and [current prompting best
practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).
The prompt gives the task, context, completion condition, progress expectations,
and actual stopping boundaries without prescribing the build or requesting
internal reasoning. Effort is a session setting rather than a prompt instruction;
Anthropic recommends starting Opus 5.5 at medium and evaluating whether a higher
setting improves the work.
