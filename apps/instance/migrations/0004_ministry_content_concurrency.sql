PRAGMA foreign_keys = ON;

ALTER TABLE groups ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE groups ADD COLUMN last_operation_id TEXT;
ALTER TABLE courses ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE courses ADD COLUMN last_operation_id TEXT;
ALTER TABLE lessons ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE lessons ADD COLUMN last_operation_id TEXT;
ALTER TABLE events ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE events ADD COLUMN last_operation_id TEXT;
ALTER TABLE sermons ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE sermons ADD COLUMN last_operation_id TEXT;
ALTER TABLE media ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE media ADD COLUMN last_operation_id TEXT;
ALTER TABLE media ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE media SET updated_at = created_at WHERE updated_at = 0;

-- Existing ministry-leader roles gain the same publishing permissions that a
-- newly bootstrapped instance receives. Owner roles retain wildcard access.
INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT id, permission
FROM roles
CROSS JOIN (
  SELECT 'courses.write' AS permission
  UNION ALL SELECT 'events.write'
  UNION ALL SELECT 'sermons.write'
  UNION ALL SELECT 'media.write'
) additions
WHERE roles.key = 'ministry-leader';
