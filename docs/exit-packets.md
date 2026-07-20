# Hosted exit packets

An exit packet is the public, provider-neutral evidence that one hosted
Fellowship42 instance completed a hosted-to-church-owned transfer. It is not a
Cloudflare account export, a secret bundle, or a promise from Fellowship42
Cloud. A church or partner can rebuild and verify it with the Apache-2.0
`f42ctl` package.

## Required evidence

`f42ctl build-exit-packet` accepts six strict records from the public lifecycle
contract:

1. the exact portable import plan;
2. its fully succeeded execution report;
3. the church-authorized cutover approval;
4. verified portable-export evidence;
5. local management-disconnect evidence from the instance; and
6. an operator handoff covering custody, every resource class, domains,
   operator dispositions, credential rotation, support expiry, and unresolved
   risks.

The builder requires one operation ID, portable instance ID, export digest,
destination-manifest digest, and exact source/destination release throughout.
The independent-operation and source-routing timestamps must be the completion
times recorded by the public import executor. Hosted exit requires management
to be `disconnected`, not merely rotated.

Every source record is canonicalized and SHA-256 bound into the packet. The
packet contains no Cloudflare account ID, resource ID, API token, private key,
database payload, R2 key, donor/member data, or private support note.

## Local revocation evidence

A church owner with `management.admin` can download the last disposition from
the Management page or request:

```text
GET /api/management/exit-disposition
```

The instance fails closed unless it can prove that there is no active
connection, no retained grant or local management identity, no replay or
command state for the disconnected connection, the disconnect audit event is
present, and the church record remains available. Disconnect also clears any
pending encrypted replacement identity and command cursor. Normal church
operation and portable export do not depend on this endpoint.

## Build and verify

```bash
f42ctl build-exit-packet \
  --plan ./import-plan.json \
  --report ./import-report.json \
  --approval ./cutover-approval.json \
  --export-evidence ./export-evidence.json \
  --management-disposition ./management-exit.json \
  --handoff ./exit-handoff.json \
  --output ./exit-packet.json

f42ctl verify-exit-packet \
  --packet ./exit-packet.json \
  --plan ./import-plan.json \
  --report ./import-report.json \
  --approval ./cutover-approval.json \
  --export-evidence ./export-evidence.json \
  --management-disposition ./management-exit.json \
  --handoff ./exit-handoff.json \
  --output ./exit-verification.json
```

Verification rebuilds the entire packet from the six records and requires
byte-equivalent canonical JSON. Its bounded verification record carries only
packet/operation/instance IDs, a packet digest, time, and verified status.

The private control plane may coordinate the operation and retain these public
records, but it must use this verifier rather than asserting custody directly.
Cloudflare credentials remain in the operator's credential broker, and the
source custody record must not change until every public check has passed.
