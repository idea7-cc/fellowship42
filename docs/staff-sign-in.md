# Staff sign-in

Passkeys let staff use the church instance without Cloudflare Access or an email
provider. Access can still be configured as an alternative. Congregation-wide
registration and member account claiming are not implemented.

## First owner

Set `SIGN_IN_ORIGIN` to the exact public HTTPS origin, without a trailing slash.
Use `http://localhost:5173` for local development. Configure
`BOOTSTRAP_OWNER_EMAIL` and a random 32-byte base64url `BOOTSTRAP_ENROLLMENT_TOKEN`
as Worker secrets. Generate and transfer that key through your operator secret
manager; never put it in a URL, commit, support ticket, or deployment log.

Open `/sign-in`, choose **First owner setup**, enter the setup key and create a
passkey. Continue to church setup. Remove the two bootstrap secrets afterward.
Keep the church domain stable: passkeys are bound to its hostname.

## Invite staff

Invite the person and assign roles from **Team**. An owner can use the link icon
on an invited person's row to create a private enrollment link. Share it only
with the intended person through a trusted channel. It grants account access;
it is not a public invitation URL. It expires in 24 hours, is single-use, and a
new link replaces the old one. No email is sent automatically.

The recipient opens the link and creates a passkey. Future visits use **Use
passkey**. Permissions always come from current church roles. Suspending or
removing membership immediately prevents protected church operations. Sign-out
revokes the current local session; sessions also expire after 12 hours.

## Owner recovery

An operator with access to this instance's Cloudflare resources can deliberately
replace an active owner's credentials. This revokes their existing identity
links, passkeys, sessions, and agent grants, while retaining church records and
roles. Verify the owner's identity outside the application first.

From `apps/instance`, with Wrangler authenticated for the correct account:

```bash
node scripts/recover-owner.mjs \
  --config wrangler.jsonc --database fellowship42 \
  --origin https://church.example --email owner@example.org \
  --output /secure/new-owner-enrollment.txt \
  --remote --confirm-reset-owner
```

Use `--local` instead of `--remote` for a disposable local instance. The output
file must not already exist. It is created with mode 0600 and contains a link
valid for ten minutes. Share it privately and delete the file afterward. A
failure can leave credentials revoked; inspect the exact target before retrying.
The script never prints the link, provider output, or SQL containing identifiers.

Only after confirming `instance_metadata` identifies the restored church, delete `local_auth_sessions`,
`local_auth_challenges`, and `local_auth_enrollments` rows. During initial setup,
retain the consumed `bootstrap` enrollment marker to prevent reuse of its key. Keep passkeys and
identities only when retaining the church domain. Reset agent OAuth credentials
separately using the agent-connection recovery procedure. A changed hostname
requires new passkeys and owner recovery. Cloud cannot recover authenticator
private keys.
