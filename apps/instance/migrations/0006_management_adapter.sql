PRAGMA foreign_keys = ON;

-- Management is optional, local-owner controlled, and bound to the portable
-- instance identity. Private key material is stored only as AES-GCM ciphertext;
-- the wrapping key remains a Worker secret and is never stored in D1.
CREATE TABLE management_identities (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  instance_id TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL UNIQUE,
  public_jwk_json TEXT NOT NULL,
  private_jwk_ciphertext TEXT NOT NULL,
  private_jwk_iv TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  rotated_at INTEGER,
  FOREIGN KEY (instance_id) REFERENCES instance_metadata(instance_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE management_enrollment_challenges (
  challenge_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  code_sha256 TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  proposal_jws_json TEXT,
  operator_id TEXT,
  operator_display_name TEXT,
  operator_key_id TEXT,
  operator_public_jwk_json TEXT,
  sync_url TEXT,
  requested_capabilities_json TEXT,
  FOREIGN KEY (instance_id) REFERENCES instance_metadata(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_management_challenges_active
  ON management_enrollment_challenges(instance_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE management_connections (
  connection_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  enrollment_challenge_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_display_name TEXT NOT NULL,
  operator_key_id TEXT NOT NULL,
  operator_public_jwk_json TEXT NOT NULL,
  sync_url TEXT NOT NULL,
  grant_version INTEGER NOT NULL CHECK (grant_version > 0),
  grant_set_json TEXT NOT NULL,
  grant_review_due_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disconnected')),
  approved_by_user_id TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  enrollment_approval_jws_json TEXT NOT NULL,
  approval_delivered_at INTEGER,
  pending_control_jws_json TEXT,
  pending_rotation_local_approval_id TEXT,
  pending_replacement_key_id TEXT,
  pending_replacement_public_jwk_json TEXT,
  pending_replacement_private_jwk_ciphertext TEXT,
  pending_replacement_private_jwk_iv TEXT,
  disconnected_by_user_id TEXT,
  disconnected_at INTEGER,
  disconnect_reason TEXT,
  last_sync_at INTEGER,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('succeeded', 'failed')),
  last_sync_code TEXT,
  command_cursor TEXT,
  CHECK (
    (
      pending_control_jws_json IS NULL AND
      pending_rotation_local_approval_id IS NULL AND
      pending_replacement_key_id IS NULL AND
      pending_replacement_public_jwk_json IS NULL AND
      pending_replacement_private_jwk_ciphertext IS NULL AND
      pending_replacement_private_jwk_iv IS NULL
    ) OR (
      pending_control_jws_json IS NOT NULL AND
      pending_rotation_local_approval_id IS NOT NULL AND
      pending_replacement_key_id IS NOT NULL AND
      pending_replacement_public_jwk_json IS NOT NULL AND
      pending_replacement_private_jwk_ciphertext IS NOT NULL AND
      pending_replacement_private_jwk_iv IS NOT NULL
    )
  ),
  FOREIGN KEY (instance_id) REFERENCES instance_metadata(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (enrollment_challenge_id) REFERENCES management_enrollment_challenges(challenge_id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (disconnected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX idx_management_one_active_connection
  ON management_connections(instance_id)
  WHERE status = 'active';

CREATE TABLE management_grants (
  connection_id TEXT NOT NULL REFERENCES management_connections(connection_id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  requires_local_approval INTEGER NOT NULL CHECK (requires_local_approval IN (0, 1)),
  PRIMARY KEY (connection_id, capability)
) STRICT;

CREATE TABLE management_replay_records (
  connection_id TEXT NOT NULL REFERENCES management_connections(connection_id) ON DELETE CASCADE,
  sender_key_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  outcome_json TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (connection_id, sender_key_id, message_id, nonce)
) STRICT;

CREATE INDEX idx_management_replay_expiry
  ON management_replay_records(expires_at);

CREATE TABLE management_command_records (
  connection_id TEXT NOT NULL REFERENCES management_connections(connection_id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  capability TEXT NOT NULL,
  command_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'succeeded', 'rejected', 'failed')),
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (connection_id, command_id),
  UNIQUE (connection_id, nonce)
) STRICT;

CREATE INDEX idx_management_commands_time
  ON management_command_records(connection_id, created_at DESC);
