# Review seat

Who fills the independent, adversarial review that the
[verification guide](../guidance/proportional-verification.md#the-review-seat)
places at checkpoints, and any code review the owner asks for. A project that
needs a different occupant overrides this item with a reason; the rest of the
library refers to the seat, never to a model.

| Seat | Preferred occupant | Alternative | When to choose / known limitation |
| --- | --- | --- | --- |
| Review seat | GPT-6.1 Sol (`gpt-6.1-sol`), xhigh effort | Sol at low or medium for a small diff, or to check one fix | A different vendor from the builder keeps the review independent; Sol tends toward caution, so weigh its added gates and tests against the project's stage |

If the occupant is unavailable, use another model that didn't build the change,
preferably from another vendor, and say so once. Recorded by CT, 2026-10-19.
