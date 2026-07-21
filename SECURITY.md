# Fellowship42 security policy

Fellowship42 handles church membership and contribution records. Do not report
a suspected vulnerability in a public issue or include real church data,
credentials, tokens, keys, exports, provider identifiers, or private service
information in a report.

## Supported versions

Security fixes target the latest stable release. A fix may be developed on the
default branch before a new release is published. Older pre-1.0 releases are not
promised security maintenance; operators should verify and move to the newest
compatible release or contact the maintainers privately when an upgrade is not
possible.

## Reporting privately

Use GitHub's **Report a vulnerability** flow for the canonical repository to
open a private security advisory. If that flow is unavailable, contact an
`idea7-cc` organization owner privately through GitHub and disclose only enough
to establish a secure reporting channel.

Include:

- affected release, commit, route/component, and deployment mode;
- prerequisites, minimal reproduction with synthetic data, and observed impact;
- whether confidentiality, integrity, authorization, portability, or
  availability is affected;
- any known exploitation or disclosure; and
- a suggested mitigation, if available.

The maintainers will acknowledge, triage, reproduce, coordinate a fix and
release, and credit the reporter when requested and safe. This is a best-effort
open-source process; no response or remediation SLA is currently offered.

## Safe research

Use an account and test instance you own or have explicit permission to test.
Use synthetic data. Avoid persistence, denial of service, social engineering,
credential collection, privacy invasion, automated scanning of third-party
instances, and access beyond what is needed to demonstrate the issue. Stop and
report if you encounter real personal or financial data.

Good-faith research that follows these limits will not be treated by project
maintainers as malicious. This statement cannot authorize testing of systems or
accounts owned by anyone else and does not bind infrastructure providers or
other parties.

## Security boundary

This policy covers the public Fellowship42 source and published artifacts. A
vulnerability in Fellowship42 Cloud, a certified partner, a church deployment,
Cloudflare, an identity provider, or a payment provider may require reporting
to that operator or vendor as well. Do not move private service details into a
public Fellowship42 issue.

For architecture and operator duties, see
[Security and privacy](docs/security-and-privacy.md) and
[Third-party operators](docs/third-party-operators.md).
