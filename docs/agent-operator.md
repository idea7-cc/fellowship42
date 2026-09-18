# Agent operator commands

`f42ctl agents-doctor` checks the exact configuration and unauthenticated OAuth
surface. It does not acquire credentials, call church tools, or prove a client
works. Use the live workflow proof for that evidence.

```bash
pnpm f42ctl agents-doctor --config apps/instance/wrangler.jsonc \
  --origin https://church.example
```

Add `--offline` to check configuration only, or `--mode local` for loopback and
local placeholder bindings. Results contain bounded checks, never configuration
secret values or provider response bodies. Redirects, incorrect audiences and
issuers, missing PKCE, oversized responses, and timeouts fail the diagnostic.
The command currently reads the selected flat Wrangler file; choose a concrete
configuration file rather than an inherited Wrangler environment. Files containing `env` are rejected.

## Reset after restore

Keep the restored instance closed to traffic until rotation and verification
complete. Create a new dedicated OAuth KV namespace in the destination account
using Wrangler. It must be empty and different from the old binding; do not
copy credentials from the source instance.

Set `account_id` in the destination's concrete Wrangler configuration. Confirm
its DB binding and `F42_PORTABLE_INSTANCE_ID` identify the restored church, then
run the following with Wrangler authenticated for that account:

```bash
pnpm f42ctl agents-reset --config apps/instance/wrangler.jsonc \
  --origin https://church.example \
  --fresh-kv-id NEW_EMPTY_NAMESPACE_ID \
  --confirm-instance-id instance_42424242-1234-5678-9abc-123456789abc \
  --account-id DESTINATION_ACCOUNT_ID \
  --output-config apps/instance/wrangler.restored.jsonc
```

The command verifies the actual D1 identity and empty replacement namespace
before effects. It revokes all agent connections, clears pending OAuth consent,
and deletes disposable staff sessions, challenges and enrollment grants.
Passkey public keys, local identities, church records, roles and audit history
are preserved. The reset itself is audited. An already-configured portable
identity is required, so this is not first-owner setup.

A new sibling configuration file points to the fresh namespace and destination
origin. The original file is preserved. **Deploy the reviewed new configuration**
and repeat the doctor check before reopening traffic. Staff must sign in again
and reconnect agents through fresh consent. A changed hostname also requires
passkey re-enrollment; use the [owner recovery procedure](staff-sign-in.md).

Use `--mode local` for disposable local exercises. A failed provider operation
can leave credentials revoked without a new configuration file. Inspect the
exact target and retry; do not infer deployment or reconnection from a successful
SQL import. The command verifies its result through a separate read because
remote Wrangler imports return statistics rather than SELECT rows.

After cutover, delete the retired OAuth namespace only when no source instance
still uses it. Keep credential material out of backups. An interrupted process
may leave an empty reserved output file; inspect it and move it aside before
retrying.
