PRAGMA foreign_keys = ON;

-- Church memberships become an operator-edited record (team invitations, role
-- changes, suspension, removal). They need their own edit version and the
-- per-operation token that conditions audit/outbox/role writes on the exact
-- optimistic-concurrency winner, matching people, households, and groups.
ALTER TABLE church_memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE church_memberships ADD COLUMN last_operation_id TEXT;
