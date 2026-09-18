# Agent client proof

Use a disposable instance containing synthetic data. A passing SDK test does
not establish that an external agent product can connect. Record the two
separately, with the source commit, date, client version, and observed outcomes.
Never include tokens, authorization codes, authorization URLs, callback URLs, or church records in
the evidence.

## Reference client

Configure the instance following [agent connections](agent-connections.md),
including the canonical HTTPS origin, dedicated OAuth KV, and staff sign-in.
Publish the synthetic website first and sign in as a user with `church.write`.
The live exercise is pending the parallel instance-owned registration/sign-in
work. Use that normal sign-in flow once available. On existing Access-backed
installations, keep discovery, token and MCP paths outside the staff redirect. Use
namespaced development resources; do not reuse another application's resources.

From a checkout running the pinned Node and pnpm versions:

```sh
pnpm --filter @fellowship42/instance agent:proof https://disposable.example --synthetic-data
```

The script prints a browser authorization URL and accepts its callback on an
ephemeral loopback port. Run the browser on the same machine. Sign in normally,
review the requested scopes, and connect. Credentials remain in process memory;
restarting requires a new connection. The script does not launch a browser,
store credentials, or collect staff cookies.

The proof checks resource discovery, S256 code exchange, refresh, tool discovery,
reads, and a saved draft. It changes the synthetic welcome line after an explicit
terminal confirmation. It retries the same observed version to simulate a lost
response and verifies that re-reading reconciles the result without a second
save. Published content must remain unchanged until you review and publish in
the app. The runner refreshes immediately before the revocation stage and proves the
same raw MCP probe succeeds. Disconnect within the fresh-token window; an
expired window is inconclusive and fails the run. Finally disconnect the reference client in Agents; both the next MCP
request and refresh must fail. A failure does not restore the edited draft:
inspect it and disconnect the reference client before retrying. Each run leaves
a client metadata registration; reset the disposable OAuth namespace when
tearing down the test instance. Named stages are printed without provider errors
or tokens so failures can be recorded safely.

The final result labels itself `reference-sdk` and
`externalClientProven: false`. The automated fixture tests the runner's failure
detection; it is not a deployed-instance observation.

## Independent external client

Repeat the workflow with the actual client product and version being evaluated.
For the installed Claude CLI, inspect `claude mcp add --help` and
`claude mcp login --help`, use a dedicated project/server name, and authenticate
through its normal OAuth flow. Do not supply an administrator bearer token or
replace OAuth with a shared development principal.

Ask the client to read the website draft, change only the synthetic welcome
line, save it, and return the preview/review links. Review and publish in the
app. Check that an attempted stale save cannot overwrite a newer human edit.
Disconnect the client and verify both tool access and refresh denial. Remove the
temporary client configuration after the exercise.

Record unsupported protocol negotiation or OAuth behavior as a failed step,
with a bounded error code. Do not declare compatibility based only on matching
SDK versions or the reference client's success. Do not add a legacy fallback
without an explicit product decision.

## Evidence register

No live deployment or independent client success is established by this PR.

| Client | Environment | Connect/read/save | Human publish | Revoke/refresh denied | Evidence |
|---|---|---|---|---|---|
| Reference SDK 2 | Automated HTTP fixture | Runner logic only (fixture) | Simulated | Runner logic only (fixture) | `scripts/agent-proof.test.mjs` |
| Reference SDK 2 | Disposable deployment | Pending | Pending | Pending | Instance-owned sign-in pending |
| Claude CLI | Disposable deployment | Pending | Pending | Pending | Instance-owned sign-in pending |

For each live run append the date, exact public commit, client version, and
pass/fail for each stage. Keep infrastructure coordinates and raw runtime
output in the operator's private evidence store. This exercise is pre-alpha
interoperability evidence, not production, pilot, or recovery certification.
