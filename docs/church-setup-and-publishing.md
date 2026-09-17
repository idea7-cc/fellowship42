# Church setup and website publishing

The church website lives at `/`. Staff work at `/app`; owners edit the church
at `/app/settings`. Both belong to the same portable instance and need no
Fellowship42 Cloud connection. Member registration is separate work.

## Owner workflow

1. Complete first-owner setup at `/app`. A new church starts unpublished.
2. In **Settings**, fill in the church name and About text. Add contact details,
   gatherings, and links as needed. The setup strip reflects saved information;
   gatherings and a first published ministry item are suggestions, not blockers.
3. Choose a style, logo, and cover image under **Appearance**. Uploaded images
   start private. Existing church images can also be selected.
4. **Save draft**, then **Preview** to inspect the saved version in a new tab.
   Unsaved form edits are not part of the preview.
5. **Publish** makes the saved profile and its selected images public. Later
   profile edits remain private until saved and published again.

A stale save or publish returns a conflict and preserves the form. **Reload
saved draft** explicitly discards the local changes after confirmation. Draft,
publish, and unpublish writes use the observed church version and commit their
audit and outbox records atomically with the change.

**Unpublish** hides the church website without deleting its records. It does
not revoke public media URLs: media has its own visibility and cache lifecycle.
After unpublishing or publishing a replacement image, an owner can change the
old image to private in **Media**. An image referenced by a published church
cannot be deleted or made private. Copies already downloaded cannot be recalled.

## What visitors see

The homepage shows the published profile, gathering times in the church's
stated timezone, contact/directions, and published events, groups, courses, and
sermons. Empty sections disappear. Courses have public detail pages at
`/courses/:slug`. Staff controls and draft details are absent.

Ministry content retains its own publish controls: publishing a group, event,
course, or sermon updates an already published site immediately. **Preview**
combines the saved profile draft with currently published ministry content;
it does not publish or expose draft ministry records. An unpublished homepage
shows a neutral placeholder without the church's draft name or contact details.

## Route and data boundaries

- `/api/site` returns the primary church's published site or `404`.
- `/api/church-settings/:churchId` and its preview/image/mutation routes require
  `church.write`. Owners have this permission; the Worker checks every request.
- Settings and preview responses are private and not cached. Public site JSON
  is also not cached. Public media keeps its existing cache policy.
- The saved profile draft lives in D1 `church_profiles.draft_json`. Publishing
  updates the published church/profile/gathering records in one transaction.
  R2 image bytes retain church-scoped D1 authorization metadata.

Configure the public/staff Access path boundary using the
[deployment runbook](deployment.md). The public page must not be placed behind
a staff login redirect. The application never introduces a local auth bypass.

The initial schema is edited in place under the pre-alpha policy. Reset local
synthetic D1 state after pulling this schema change, then migrate and seed as
described in [AGENTS.md](../AGENTS.md).
