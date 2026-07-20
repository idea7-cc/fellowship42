# ADR 0016: Publish exact-source upgrade metadata

Status: accepted

## Context

Fleet operators need a machine-readable answer to a narrow question: may this
exact installed Fellowship42 release enter an upgrade to this exact target
release? Inferring that answer from semantic versions, migration filenames, or
a private release catalog would make third-party operators less capable and
would allow the hosted service to claim compatibility that the public artifact
does not declare.

Upgrade execution also crosses a destructive boundary. A successful build is
not evidence that a live instance is ready, recoverable, or approved for an
upgrade. Schema rollback is especially unsafe once a migration has executed.

## Decision

Every newly published release manifest includes strict format-v1 `upgrade`
metadata. It declares:

- an exact allowlist of source release tags, manifest SHA-256 digests,
  application versions, schema versions, and management wire versions;
- the `in-place-expand-contract` strategy;
- `roll-forward-after-migration` as the rollback policy; and
- the bounded evidence classes an operator must obtain before application.

The public management-protocol package owns the schema and an exact-match
eligibility function. The checked-in `release-upgrade-policy.json` is validated
and embedded by the release builder. Historical format-v1 manifests remain
valid without the optional field, but absence means `upgrade-metadata-missing`,
never implied compatibility.

Release channels, rollout rings, eligibility exceptions, approval records,
soak periods, and fleet policy remain operator concerns. They may narrow the
public allowlist but cannot widen it. Upgrade execution remains a later public
lifecycle contract and must use published primitives rather than private
database mutation.

## Consequences

- Self-hosters, partners, and Fellowship42 Cloud make the same source/target
  compatibility decision from immutable public evidence.
- A digest mismatch fails closed even if a tag and semantic version look
  familiar.
- Releases may require stepping through an intermediate version by listing only
  sources whose direct path was tested.
- Operators must retain explicit doctor, export, artifact-verification, and
  approval evidence for the first supported path.
- After a migration begins, recovery policy is roll-forward; restoration is an
  explicit incident operation, not an automatic downgrade.
