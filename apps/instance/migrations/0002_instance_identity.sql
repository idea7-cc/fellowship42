PRAGMA foreign_keys = ON;

-- One portable Fellowship42 installation is the deployment, ownership, export,
-- and management boundary. `church_id` remains on domain tables as a
-- defense-in-depth authorization and relational-integrity boundary.
CREATE TABLE instance_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  instance_id TEXT NOT NULL UNIQUE,
  topology TEXT NOT NULL CHECK (topology = 'single-church'),
  primary_church_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (primary_church_id) REFERENCES churches(id)
) STRICT;
