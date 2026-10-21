# Why these pieces

These are references for the selected ideas, not dependencies required to use
this library. The guidance is an original, deliberately small synthesis.

| Reference | What this library takes from it |
| --- | --- |
| [AGENTS.md](https://agents.md/) | A readable project instruction handoff used by multiple coding agents |
| [Agent Skills specification](https://agentskills.io/specification) | A portable folder and `SKILL.md` format for task-specific guidance |
| [Vertical Slice Architecture — Jimmy Bogard](https://www.jimmybogard.com/vertical-slice-architecture/) | Keep code that changes together near the feature it serves |
| [Screaming Architecture — Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) | Make the system's purpose visible in its organization |
| [Functional Core, Imperative Shell — Gary Bernhardt](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) | Make decisions over values; put effects at visible boundaries |
| [Locality of Behaviour — htmx](https://htmx.org/essays/locality-of-behaviour/) | Reduce the distance a reader must travel to understand behavior |
| [Codebase design skill — Matt Pocock](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md) | Prefer cohesive implementations with small public interfaces |
| [Ponytail — Dietrich Gebert](https://github.com/DietrichGebert/ponytail/blob/2a1fe842d078cf66ec7f3e6096a8ca4279c2cad7/skills/ponytail/SKILL.md) | Try existing code, platform features and installed dependencies before writing the smallest complete implementation |
| [Documenting Architecture Decisions — Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | Save a short rationale when a consequential decision needs durable context |
| [Golden Paths — Backstage](https://backstage.io/blog/2020/09/08/announcing-tech-docs/#golden-paths) | Offer a useful starting path and examples, without requiring the Backstage platform |
| [Rethinking skills and prompts — OpenAI](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | Keep discovery precise and revisit accumulated scaffolding when models change |
| [SkillsBench](https://arxiv.org/abs/2602.12670) | Evaluate focused skills against a matched baseline instead of assuming more guidance helps |
| [Evaluating agent skills — OpenHands](https://www.openhands.dev/blog/evaluating-agent-skills) | Compare observable outcomes with and without guidance; inspect task- and model-specific effects |

## Optional later additions

- [Copier](https://copier.readthedocs.io/en/stable/) if repeated projects justify
  executable templates and reviewed template updates. The initial blueprints are
  advisory documents, not a template engine.
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) for inspecting
  JavaScript/TypeScript dependencies and, if useful, a few advisory boundary checks.

Selected technology and dependency-cleanup defaults, including
[Knip](https://knip.dev/overview/getting-started), live in
[technology preferences](preferences/technology.md).

Add tools when they solve a demonstrated problem. The library avoids a
policy framework, package registry, runtime enforcement, and automatic model routing.

For the optional Claude adapter, see its official
[memory and import documentation](https://code.claude.com/docs/en/memory) and
[skills documentation](https://code.claude.com/docs/en/skills). Other harnesses
may need their own small adapter; the content remains ordinary Markdown.
