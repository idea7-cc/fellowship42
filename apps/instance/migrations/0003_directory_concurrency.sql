PRAGMA foreign_keys = ON;

-- Opaque per-operation tokens let multi-statement D1 batches condition their
-- audit/outbox/member writes on the exact optimistic-concurrency winner.
ALTER TABLE people ADD COLUMN last_operation_id TEXT;
ALTER TABLE households ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE households ADD COLUMN last_operation_id TEXT;
