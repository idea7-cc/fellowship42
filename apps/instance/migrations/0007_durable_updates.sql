PRAGMA foreign_keys = ON;

-- An instance verifies an immutable target and records the church owner's
-- exact, expiring authorization. Infrastructure credentials remain outside
-- the instance; the authorization is evidence for an external reconciler.
CREATE TABLE management_update_preparations (
  preparation_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  source_release_tag TEXT NOT NULL,
  source_manifest_sha256 TEXT NOT NULL,
  source_application_version TEXT NOT NULL,
  source_schema_version INTEGER NOT NULL CHECK (source_schema_version >= 0),
  source_wire_version TEXT NOT NULL,
  target_release_tag TEXT NOT NULL,
  target_manifest_sha256 TEXT NOT NULL,
  target_application_version TEXT NOT NULL,
  target_schema_version INTEGER NOT NULL CHECK (target_schema_version >= 0),
  target_wire_version TEXT NOT NULL,
  target_manifest_json TEXT NOT NULL,
  required_evidence_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'awaiting-local-approval', 'approved', 'authorized', 'applied',
    'expired', 'superseded'
  )),
  prepared_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  local_approval_id TEXT UNIQUE,
  approved_by_user_id TEXT,
  approved_at INTEGER,
  approval_expires_at INTEGER,
  approval_consumed_at INTEGER,
  authorization_id TEXT UNIQUE,
  authorized_at INTEGER,
  authorization_expires_at INTEGER,
  applied_at INTEGER,
  CHECK (expires_at > prepared_at),
  CHECK (
    (local_approval_id IS NULL AND approved_by_user_id IS NULL AND
     approved_at IS NULL AND approval_expires_at IS NULL AND
     approval_consumed_at IS NULL) OR
    (local_approval_id IS NOT NULL AND approved_by_user_id IS NOT NULL AND
     approved_at IS NOT NULL AND approval_expires_at IS NOT NULL)
  ),
  CHECK (
    (authorization_id IS NULL AND authorized_at IS NULL AND
     authorization_expires_at IS NULL) OR
    (authorization_id IS NOT NULL AND authorized_at IS NOT NULL AND
     authorization_expires_at IS NOT NULL AND approval_consumed_at IS NOT NULL)
  ),
  CHECK ((state = 'applied') = (applied_at IS NOT NULL)),
  FOREIGN KEY (instance_id) REFERENCES instance_metadata(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES management_connections(connection_id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX idx_management_update_active_target
  ON management_update_preparations(
    connection_id, target_release_tag, target_manifest_sha256
  )
  WHERE state IN ('awaiting-local-approval', 'approved', 'authorized');

CREATE INDEX idx_management_update_recent
  ON management_update_preparations(instance_id, prepared_at DESC);
