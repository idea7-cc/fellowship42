# Web application starting shape

Use the framework's native routes and lifecycle. Choose products from
[technology preferences](../preferences/technology.md), and record the actual
choices and commands in the project's instructions.

For example, a React + Vite application can compose feature pages through its
router. An Astro content site can use EmDash when managed publishing is needed.
Choose static or on-demand rendering from the content contract: marketing
content and a live published-data view may need different rendering paths.

| Home | Responsibility |
| --- | --- |
| Framework routes / pages | Request or navigation entry points and screen composition |
| Features such as orders or billing | Feature behavior, components, schemas, and tests that change together |
| Provider integrations | Provider-specific API calls, serialization, and configuration |
| Shared UI | Components with demonstrated reuse and a clear visual purpose |

This is a responsibility map, not four required folders. Framework routes may
already provide feature locality. Keep UI-only behavior close to its component;
keep domain rules accessible without rendering a screen. Put persistence and
external calls behind a clear boundary when that makes the feature easier to use.

Start with one real end-to-end feature and its meaningful checks. Let the next
feature demonstrate what should be shared. Avoid creating a general framework
inside the application.

If agents are intended clients, their tools should call the same feature
operations as the UI. Each adapter validates its own input and identity; the
feature keeps the rules and the storage authority.

Use [code design](../guidance/code-design.md) to decide where a new function belongs.
