# Review and recover a website draft

Church settings shows who last edited the saved draft and a collapsed comparison
with the published profile. Expand **Review changes** to inspect the changed
fields and images. Preview shows saved content; unsaved form edits stay local.

**Restore previous** restores the previous saved draft. Consecutive agent edits
preserve the draft from before the agent started editing, so a second agent save
cannot erase that recovery point. Human saves and restores replace the recovery
point. There is one previous snapshot, not a revision history. Restored content
stays private until you publish it. Restoring swaps the current and previous
snapshots, so the last restore can itself be reversed. Neither saving nor
restoring changes published content.

Only a current user with `church.write` can restore or publish. Agents can save
private drafts but cannot restore or publish them. Every successful mutation
checks the observed version and current authority inside the same transaction as
audit/outbox evidence. A stale restore or publish makes no change. If someone
saves a newer draft while you are editing, your input stays in the form and you
must explicitly reload before acting on that newer version. A clean editor also
asks you to reload a newer version before publishing, so a background refresh
cannot silently change the version you are reviewing. It does not ask for a
discard confirmation when there are no local edits.

Attribution identifies the last editor or the connected agent's displayed name.
It is context for review, not a verified endorsement of the client's identity.
Audit retains the authorizing user and connection identifiers. Draft snapshots
and attribution stay in the instance database and travel with its export; they
are not public website fields or Cloud telemetry. Restoring an image whose media
record has since been deleted fails validation without changing the current draft.
