# Compatible operator test inputs

Fellowship42 publishes one ordered, payload-free compatibility profile for
self-hosters, service operators, and prospective certified partners:

```text
@fellowship42/management-protocol/fixtures/partner-compatibility-profile.v1.json
```

The strict `partnerCompatibilityProfileSchema` validates the profile. It binds
five public inputs that exercise release integrity, offline diagnostics,
management interoperability, isolated restore, and hosted-to-church-owned
migration. Every input is available from public release artifacts, requires no
provider credential, and contains no church record or media payload.

## Required inputs

| Input | What it demonstrates |
|---|---|
| Release artifact verification | The exact tagged source and packages reproduce and pass their checksums. |
| Offline instance doctor | A deployment manifest is structurally compatible without contacting Cloudflare. |
| Management adapter conformance | Enrollment, signing, replay, grants, rotation, denial, and disconnect interoperate. |
| Portable restore conformance | Export and restore fail closed and preserve portable identity without exposing the bundle. |
| Hosted-to-church-owned rehearsal | The public transfer path works across isolated synthetic custody boundaries. |

Use the exact public command or fixture reference in the profile and validate
the resulting evidence with the named exported schema. A partner program may
record the evidence digest and exact release tuple; it must not copy church
payloads into a certification system.

## Certification boundary

Passing the public profile proves software compatibility only. It does not
prove that a particular Cloudflare account, backup schedule, support practice,
security program, or human operator has been reviewed. The Fellowship42
certified-partner designation therefore requires separate private governance
and live operational evidence. Certification must not alter the open-source
instance, grant management access, or weaken a church's local revocation and
exit rights.

