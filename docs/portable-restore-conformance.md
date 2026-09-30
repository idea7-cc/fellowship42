# Portable isolated-restore conformance

The public `runPortableRestoreConformance` runner lets any deployment operator
prove that its collector and restore adapter honor Fellowship42's portable
lifecycle boundary. It exercises the real `f42ctl` export and import functions;
it is not a private hosted-service API and it receives provider access only
through an injected adapter.

## Required harness inputs

- a deployment manifest and operator-quiesced D1/R2 collector capture, plus
  the website D1/R2 capture when the manifest declares a website;
- a distinct destination manifest preserving the portable instance ID and
  exact format-v1 release;
- a new output directory; and
- adapters for a successful isolated restore, a nonempty/unproven destination,
  and a failure after D1 but during R2 restore.

The success adapter must prove newly created empty D1 and R2 resources, restore
all artifacts, apply forward migrations, deploy without domains, rotate
deployment/application/management credentials, verify the restored portable
identity, and verify runtime health. The runner stops before domain cutover and
source retirement.

With a website capture the adapter must also prove an empty website D1 and R2,
restore them, deploy the website Worker without domains, and verify that the
website runs and pins the restored identity. The runner additionally requires a
tampered website D1 artifact to be rejected.

## Report and privacy boundary

Success emits profile `f42-portable-restore-v1` with nine ordered passing
scenarios, or ten when the capture includes a website: `website-restored`
follows `d1-and-r2-restored`. The report includes only release and format
versions. It excludes
the portable instance ID, export digest, D1 rows, R2 keys or bytes, domains,
provider identifiers, storage locations, credentials, timestamps, and
arbitrary adapter output.

The
`packages/management-protocol/fixtures/portable-restore-conformance.v1.json`
report is the ten-scenario result for an installation with a website. The test
suite reproduces it through the real runner and also checks that the
instance-only run equals it without `website-restored`. Compatible
management software can validate it with
`portableRestoreConformanceReportSchema`.

## What it does not prove

This suite does not certify Cloudflare credentials, D1 export polling, R2
streaming, artifact encryption, retention deletion, DNS propagation, or an
RPO/RTO. A hosted service must separately exercise those operations in its
isolated staging account and retain bounded evidence. See
[ADR 0013](adr/0013-payload-free-isolated-restore-conformance.md).
