PRAGMA foreign_keys = ON;

ALTER TABLE contributions ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE contributions ADD COLUMN last_operation_id TEXT;
ALTER TABLE contributions ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE webhook_events ADD COLUMN church_id TEXT REFERENCES churches(id) ON DELETE CASCADE;
ALTER TABLE webhook_events ADD COLUMN request_hash TEXT;
ALTER TABLE webhook_events ADD COLUMN processing_started_at INTEGER;

CREATE INDEX idx_webhook_recovery
  ON webhook_events(status, processing_started_at, received_at);

ALTER TABLE outbox_events ADD COLUMN processing_started_at INTEGER;

-- Delivery claims and retries use this index to avoid scanning historical
-- delivered events. Existing installations retain their pending records.
CREATE INDEX idx_outbox_recovery
  ON outbox_events(status, processing_started_at, available_at, created_at);
