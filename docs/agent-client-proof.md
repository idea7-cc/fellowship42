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
Use the [instance-owned passkey flow](staff-sign-in.md). On existing Access-backed
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

Observed on **2026-09-18**, using public source commit
`c92ca6e` (the proof branch plus merged staff passkey and draft-review work),
Node 26.9.0, a dedicated synthetic Cloudflare Worker, and a fresh D1 schema.
The deployment used its own D1, R2, KV, queues, and rate-limit namespace.
This source was deployed before operator-tooling PR #46; the live observation
was not repeated after those CLI-only changes.

| Client | Environment | Observed outcome |
|---|---|---|
| Reference SDK 2.0.0 | Automated HTTP fixture | Runner success/failure detection, including stale retries and revocation negative controls |
| Reference SDK 2.0.0, protocol 2026-07-28 | Disposable deployment | All 11 stages passed: discovery, consent, exchange, refresh, read, save, retry, publication, fresh-token control, revocation, refresh denial |
| Claude Code 2.1.276, Fable 5.1 high | Same disposable deployment | Native CIMD/OAuth connection; `read_church`, `read_website_draft`, `save_website_draft`, then verification read succeeded |
| Claude Code 2.1.276 | After staff disconnect | Fresh client process reported the server as `needs-auth`; no church tools or church data were available, and it did not reauthenticate |

Login and the successful tool calls ran in separate Claude Code processes, so
stored credentials worked before staff disconnected them.

The independent client's save changed only the synthetic welcome line, advanced
version 7 to 8, and returned `publicationChanged: false`. A separate public read
confirmed that the saved draft was private. The staff app then published it and
the public read matched. Staff disconnected the connection in Agents before the
fresh independent-client check.

Staff browser steps used isolated Chromium with a virtual WebAuthn authenticator
and the real passkey, consent, publication, and disconnect UI. This verifies the
browser/server flow; it is not a claim about a physical authenticator or a human
usability study. Desktop draft-review screenshots were inspected. Bootstrap
secrets were removed after owner setup.

The reference runner directly observed the fresh-token revocation response and
`invalid_grant` refresh denial. Claude Code's internal refresh exchange and a
second stale-write attempt were not separately instrumented; the independent
observation is its native connection, successful tool calls, private save, and
loss of access after disconnect. Keep those evidence boundaries explicit.

Infrastructure coordinates, synthetic browser credentials and raw client
transcripts remain outside the repository. This is bounded pre-alpha
interoperability evidence, not production, pilot, or recovery certification.
