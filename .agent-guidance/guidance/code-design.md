# Code that supplies its own context

A new reader should be able to find the owning feature, understand its public
operations, and follow a change without opening unrelated parts of the system.
Use these defaults in proportion to the project; its language and framework may
already provide a good organization.

## Choose the smallest complete change

Take the first option that fully meets the requested behavior:

1. Leave out features and flexibility the task does not need.
2. Reuse the project's existing code and conventions.
3. Use the standard library or platform where the project has no suitable solution.
4. Use a suitable installed dependency.
5. Write the small, clear implementation that remains necessary.

For example, an existing input component with `type="date"` may supply a date
field without a calendar library, if it meets the required interactions.

Follow the affected flow through callers, tests, fixtures, configuration and
exports. Include everything the change requires. Preserve necessary validation,
data-loss handling, security and accessibility. Judge simplicity by what a reader
must understand; a cryptic one-liner or incomplete fix is not an improvement.

## Give behavior a clear home

Organize primarily around capabilities or features when the framework permits.
Keep things that change together close together. Names such as `orders`,
`cancelOrder`, and `InvoiceTotals` explain purpose better than `manager`,
`process`, or `utils`.

Before adding a function, identify the behavior it belongs to. Put a domain
decision in its feature; put provider-specific mechanics in the integration
that owns them; put application sequencing at the entry point. Extend the
existing owner before creating another generic bucket. Extract shared code
when its meaning and actual reuse are clear.

A small feature can be one file. Split it when distinct responsibilities make
navigation easier, not to satisfy a file-size target or a prescribed set of layers.

## Expose a small, useful interface

Give a feature a few named operations with explicit inputs and results. Keep
its internal helpers private according to the language's conventions. Callers
should not need to understand storage details or perform hidden preparation to
use it correctly.

An interface includes errors, invariants, required ordering, and configuration,
not just a function signature. State surprising constraints near the interface.
Avoid pass-through wrappers and speculative extension points. A cohesive
implementation behind a small interface can be easier to reason about than many
tiny abstractions that callers must coordinate.

## Make effects visible

Where useful, express business decisions as ordinary functions over values.
Keep network calls, persistence, clocks, and other effects explicit at a boundary.
The application can read input, call the feature, and apply its result.

Use a provider interface or adapter when it simplifies testing, contains a
provider's concepts, or supports a real replacement need. Do not build a universal
provider abstraction merely because another provider might exist. Check actual
SDK behavior and project needs before selecting the boundary.

Prefer explicit dependencies and straightforward control flow over hidden global
state, magic registration, and chains of indirect callbacks. Use native framework
conventions when they make those relationships easier to see.

For substantial service workflows, make dependencies, failures, cancellation
and resource lifetimes visible. Connect services at the execution boundary,
await request-owned work, and make background handoffs explicit. Keep transaction
authority where it belongs. Work that must survive interruption needs durable operation
state as well as runtime coordination. For example, a timed-out payment request
may have succeeded: preserve its operation identity and uncertain outcome,
then reconcile before repeating the effect. Use provider idempotency when supported.

## Replace, don't accumulate

When a path is superseded, move its callers and delete it in the same change.
Keep an adapter, migration or fallback only for a consumer the project says it
supports, with a note beside it saying why it exists and when it can go. Until a
project supports anyone, change unreleased formats, schemas and internal APIs
freely, and rebuild test data instead of migrating it. Two ways of doing the same
thing cost every later reader more than the rewrite did.

## Keep context close and truthful

- Types, schemas, and validation should reveal accepted values and failure cases.
- Comments explain non-obvious reasons and constraints; names and code explain mechanics.
- Tests demonstrate important public behavior, including meaningful failures.
  Avoid locking in private implementation details.
- A brief directory note can explain ownership, entry points, and unusual boundaries.
  Add one where code alone leaves a real question; avoid a README for every folder.
- Record a short decision note for a consequential choice whose rationale would
  otherwise disappear. Keep commands and project facts in local project instructions.

Where schemas, types and clients describe the same contract, choose one
authoritative source and infer or generate the rest. Use native framework
validators where they own the boundary. Change the source, regenerate, and
inspect affected callers together; do not hand-edit generated output. For
example, a Convex function change updates its generated API and callers, while
a Worker binding change regenerates its environment types.

## A useful review question

Could an agent arriving without this conversation locate the change, understand
its contract, and modify it confidently? Look for ambiguous ownership, broad
interfaces, hidden effects, scattered feature logic, old paths beside their
replacements, and stale documentation. Improve the specific difficulty instead
of applying a blanket rewrite.

A project's own instructions should name one feature in its own code that shows
these choices well; copy that rather than a generic example.
