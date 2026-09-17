# Team and roles

The team is the set of people who can sign in to one church instance and the
roles each of them holds. It is church-private application data, authoritative
in the instance D1 database, and never copied to Fellowship42 Cloud.

Bootstrap creates exactly one membership: the first owner. Every later staff
member, finance user, or ministry leader is added through the **Team** page or
the API described here. Nothing else creates a membership.

## Authorization

- `team.manage` lists the team and invites, changes, suspends, and removes
  members. The system owner role holds `*`, so owners always have it.
- Every route resolves the signed-in Access identity to an active church
  membership and checks the permission in D1. Browser state only decides which
  controls to show.
- Roles are the four system roles created at bootstrap (`owner`, `finance`,
  `ministry-leader`, `member`) plus any roles later added to the `roles` table.
  The API rejects unknown role keys instead of dropping them.

## Sign-in is separate from membership

Cloudflare Access decides who may reach the instance at all. An invitation only
tells the instance which roles that email receives once Access lets the person
through. Both are required:

1. Add the person to the Access policy for the instance application.
2. Invite the same email from **Team** and choose roles.

The order does not matter. A person who signs in before being invited receives
a sign-in account with no membership; inviting that email later links the
existing account. A person invited first waits as `invited` until their first
verified sign-in claims the account.

The instance sends no email. Tell the person to sign in.

## API behavior

Routes live under `/api/team/{churchId}`.

| Route | Effect |
|---|---|
| `GET /` | Members with account status, membership status, role keys, join and last-seen times, and the observed `version`; plus the church roles with their permissions. |
| `POST /invitations` | Creates or links the sign-in account by email, creates or reactivates the membership, and assigns the given roles. Returns `201` with the member. |
| `PATCH /{membershipId}` | Replaces roles and/or sets membership status to `active` or `suspended`. Requires the observed `version`. |
| `DELETE /{membershipId}` | Marks the membership `left` and removes its roles. Requires the observed `version`. |

Emails are matched case-insensitively. Inviting an email that already holds an
active or suspended membership returns `409 team_member_exists`. A removed
person can be invited again and reuses the same membership record.

A suspended membership keeps its roles but grants nothing: the session reports
no membership and every protected route returns `403`. Reinstating restores the
roles unchanged. Removing keeps the sign-in account, so the person can still
be invited elsewhere or later; only the church membership and roles are gone.

## Concurrency and the last owner

Each membership carries an edit `version`. Role changes, suspension, and
removal must submit the version they loaded, and D1 applies the change only
when it still matches. An opaque per-operation token conditions every later
statement in the batch, so a losing concurrent request writes no role rows,
audit event, or outbox event.

The same guarded statement refuses any change that would leave the church with
no active membership holding the `owner` role. That includes demoting, suspending,
or removing the only owner, and the owner doing it to themselves. The response
is `409 last_owner_required`; add a second owner first.

## Evidence

Successful changes write `team.member.invited`, `team.member.updated`, and
`team.member.removed` audit events with the acting user, request ID, and role
keys, and publish the membership ID through the outbox. Audit metadata never
contains the email or name. Realtime clients receive a `membership` change and
refresh their session, so a role change takes effect the next time the affected
person loads a page.

## Not covered yet

- Linking a team member to their `people` record.
- Custom roles or per-permission editing; roles are assigned, not authored.
- Member self-service identity, which is proposed in ADR 0020.
