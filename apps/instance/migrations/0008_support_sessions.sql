PRAGMA foreign_keys = ON;

-- Support access is requested over the signed management channel but remains
-- a church-owned, locally approved, time-limited decision. The control plane
-- receives only bounded session metadata; it never gains direct D1 access.
CREATE TABLE management_support_sessions (
  request_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  source_command_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  requested_minutes INTEGER NOT NULL CHECK (requested_minutes BETWEEN 5 AND 120),
  scope TEXT NOT NULL CHECK (scope = 'operational-diagnostics'),
  support_operator_id TEXT NOT NULL CHECK (length(support_operator_id) BETWEEN 1 AND 128),
  support_operator_display_name TEXT NOT NULL CHECK (
    length(support_operator_display_name) BETWEEN 1 AND 160
  ),
  state TEXT NOT NULL CHECK (
    state IN ('awaiting-local-approval', 'approved', 'rejected', 'revoked', 'expired')
  ),
  requested_at INTEGER NOT NULL,
  decision_due_at INTEGER NOT NULL,
  decided_by_user_id TEXT,
  decided_at INTEGER,
  expires_at INTEGER,
  revoked_by_user_id TEXT,
  revoked_at INTEGER,
  decision_reason TEXT,
  CHECK (decision_due_at > requested_at),
  CHECK (
    (state = 'awaiting-local-approval' AND decided_by_user_id IS NULL AND
     decided_at IS NULL AND expires_at IS NULL) OR
    (state IN ('approved', 'revoked') AND decided_by_user_id IS NOT NULL AND
     decided_at IS NOT NULL AND expires_at IS NOT NULL) OR
    (state = 'rejected' AND decided_by_user_id IS NOT NULL AND
     decided_at IS NOT NULL AND expires_at IS NULL) OR
    state = 'expired'
  ),
  CHECK (
    (state = 'revoked' AND revoked_by_user_id IS NOT NULL AND revoked_at IS NOT NULL)
    OR (state <> 'revoked' AND revoked_by_user_id IS NULL AND revoked_at IS NULL)
  ),
  FOREIGN KEY (instance_id) REFERENCES instance_metadata(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES management_connections(connection_id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (connection_id, source_command_id)
) STRICT;

CREATE INDEX idx_management_support_sessions_current
  ON management_support_sessions(instance_id, state, requested_at DESC);

