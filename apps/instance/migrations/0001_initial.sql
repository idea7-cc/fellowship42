PRAGMA foreign_keys = ON;

-- Tenancy and public church profile are deliberately separate. Operational
-- lifecycle fields stay on churches; public presentation can evolve without
-- widening every tenant query.
CREATE TABLE churches (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  plan TEXT NOT NULL DEFAULT 'community' CHECK (plan IN ('community', 'hosted', 'plus')),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  locale TEXT NOT NULL DEFAULT 'en-US',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX idx_churches_status ON churches(status, name) WHERE deleted_at IS NULL;

CREATE TABLE church_profiles (
  church_id TEXT PRIMARY KEY REFERENCES churches(id) ON DELETE CASCADE,
  tagline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'US',
  phone TEXT,
  email TEXT,
  website_url TEXT,
  giving_url TEXT,
  livestream_url TEXT,
  theme_preset TEXT NOT NULL DEFAULT 'warm',
  theme_accent TEXT,
  theme_surface TEXT,
  theme_ink TEXT,
  theme_hero_tone TEXT,
  theme_radius TEXT,
  theme_heading_font TEXT,
  theme_body_font TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE service_times (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  local_time TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_service_times_church ON service_times(church_id, sort_order);

-- Identity is global; authorization is church-scoped. A person may be linked
-- to a user, but user accounts and pastoral/member records remain distinct.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email_at_provider TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, subject)
);

CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);

CREATE TABLE church_memberships (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'left')),
  joined_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(church_id, user_id),
  UNIQUE(church_id, id)
);

CREATE INDEX idx_church_memberships_user ON church_memberships(user_id, status);
CREATE INDEX idx_church_memberships_church ON church_memberships(church_id, status);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(church_id, key),
  UNIQUE(church_id, id)
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY(role_id, permission)
);

CREATE INDEX idx_role_permissions_permission ON role_permissions(permission, role_id);

CREATE TABLE membership_roles (
  church_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(membership_id, role_id),
  FOREIGN KEY(church_id, membership_id) REFERENCES church_memberships(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, role_id) REFERENCES roles(church_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_membership_roles_church ON membership_roles(church_id, membership_id);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country_code TEXT NOT NULL DEFAULT 'US',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, id)
);

CREATE INDEX idx_households_church_name ON households(church_id, name) WHERE deleted_at IS NULL;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  sort_name TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  phone TEXT,
  membership_status TEXT NOT NULL DEFAULT 'guest' CHECK (membership_status IN ('guest', 'regular-attender', 'member', 'volunteer', 'inactive')),
  volunteer_ready INTEGER NOT NULL DEFAULT 0 CHECK (volunteer_ready IN (0, 1)),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, id)
);

CREATE INDEX idx_people_church_name ON people(church_id, sort_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_church_status ON people(church_id, membership_status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_people_church_email ON people(church_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE household_people (
  church_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'other',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(household_id, person_id),
  FOREIGN KEY(church_id, household_id) REFERENCES households(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE CASCADE
);

CREATE TABLE ministries (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  audience TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id)
);

CREATE INDEX idx_ministries_church_status ON ministries(church_id, status, title) WHERE deleted_at IS NULL;

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  ministry_id TEXT,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  group_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  location TEXT,
  enrollment_policy TEXT NOT NULL DEFAULT 'closed' CHECK (enrollment_policy IN ('closed', 'request', 'open')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id),
  FOREIGN KEY(church_id, ministry_id) REFERENCES ministries(church_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_groups_church_status ON groups(church_id, status, title) WHERE deleted_at IS NULL;
CREATE INDEX idx_groups_ministry ON groups(church_id, ministry_id, status) WHERE deleted_at IS NULL;

CREATE TABLE group_leaders (
  church_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'leader' CHECK (role IN ('leader', 'apprentice', 'host')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, person_id),
  FOREIGN KEY(church_id, group_id) REFERENCES groups(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE CASCADE
);

CREATE TABLE group_memberships (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'interested' CHECK (status IN ('interested', 'pending', 'active', 'paused', 'completed')),
  joined_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(group_id, person_id),
  FOREIGN KEY(church_id, group_id) REFERENCES groups(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_group_memberships_person ON group_memberships(church_id, person_id, status);

CREATE TABLE group_sessions (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  location TEXT,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'open', 'submitted', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(church_id, id),
  FOREIGN KEY(church_id, group_id) REFERENCES groups(church_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_group_sessions_group_start ON group_sessions(church_id, group_id, starts_at);

CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'serving')),
  checked_in_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(session_id, person_id),
  FOREIGN KEY(church_id, session_id) REFERENCES group_sessions(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_attendance_person ON attendance_records(church_id, person_id, created_at DESC);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  ministry_id TEXT,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  course_type TEXT NOT NULL,
  delivery_mode TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  certificate_offered INTEGER NOT NULL DEFAULT 0 CHECK (certificate_offered IN (0, 1)),
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id),
  FOREIGN KEY(church_id, ministry_id) REFERENCES ministries(church_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_courses_church_status ON courses(church_id, status, title) WHERE deleted_at IS NULL;

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT,
  media_id TEXT,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(course_id, sort_order),
  UNIQUE(church_id, course_id, id),
  FOREIGN KEY(church_id, course_id) REFERENCES courses(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, media_id) REFERENCES media(church_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_lessons_course_order ON lessons(church_id, course_id, sort_order);

CREATE TABLE course_enrollments (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  person_id TEXT,
  group_id TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'completed', 'archived')),
  started_at INTEGER,
  completed_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(church_id, course_id, id),
  CHECK ((person_id IS NOT NULL AND group_id IS NULL) OR (person_id IS NULL AND group_id IS NOT NULL)),
  FOREIGN KEY(church_id, course_id) REFERENCES courses(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, group_id) REFERENCES groups(church_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_course_enrollment_person ON course_enrollments(course_id, person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX idx_course_enrollment_group ON course_enrollments(course_id, group_id) WHERE group_id IS NOT NULL;

CREATE TABLE lesson_completions (
  church_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(enrollment_id, lesson_id),
  FOREIGN KEY(church_id, course_id, enrollment_id)
    REFERENCES course_enrollments(church_id, course_id, id) ON DELETE CASCADE,
  FOREIGN KEY(church_id, course_id, lesson_id)
    REFERENCES lessons(church_id, course_id, id) ON DELETE CASCADE
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  summary TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  timezone TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  registration_url TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id)
);

CREATE INDEX idx_events_church_start ON events(church_id, starts_at, status) WHERE deleted_at IS NULL;

CREATE TABLE sermons (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  speaker TEXT NOT NULL,
  series TEXT,
  summary TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  audio_media_id TEXT,
  preached_at INTEGER NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id),
  FOREIGN KEY(church_id, audio_media_id) REFERENCES media(church_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_sermons_church_date ON sermons(church_id, preached_at DESC, status) WHERE deleted_at IS NULL;

CREATE TABLE facilities (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'decommissioned')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  location TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, name),
  UNIQUE(church_id, id)
);

CREATE TABLE facility_bookings (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('hold', 'confirmed', 'cancelled')),
  owner_type TEXT,
  owner_id TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at),
  FOREIGN KEY(church_id, facility_id) REFERENCES facilities(church_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_facility_bookings_conflicts ON facility_bookings(church_id, facility_id, starts_at, ends_at) WHERE status != 'cancelled';

-- Money is stored in minor units; webhook IDs and idempotency keys prevent
-- duplicated financial records during provider retries.
CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id TEXT,
  donor_name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  fund TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'refunded', 'failed')),
  recurring INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0, 1)),
  provider TEXT,
  provider_payment_id TEXT,
  donated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(church_id, person_id) REFERENCES people(church_id, id) ON DELETE RESTRICT,
  UNIQUE(provider, provider_payment_id)
);

CREATE INDEX idx_contributions_church_date ON contributions(church_id, donated_at DESC);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  church_id TEXT REFERENCES churches(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  checksum TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, id)
);

CREATE INDEX idx_media_church ON media(church_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE landing_pages (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL,
  owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  theme_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (theme_mode IN ('inherit', 'custom')),
  theme_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(church_id, slug),
  UNIQUE(church_id, id)
);

CREATE TABLE landing_page_blocks (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  settings_json TEXT,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(page_id, sort_order),
  FOREIGN KEY(church_id, page_id) REFERENCES landing_pages(church_id, id) ON DELETE CASCADE
);

-- Operational integrity primitives.
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  last_error TEXT,
  UNIQUE(provider, external_id)
);

CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(scope, key)
);

CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  church_id TEXT REFERENCES churches(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  last_error TEXT
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, available_at, created_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  church_id TEXT REFERENCES churches(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  request_id TEXT,
  before_json TEXT,
  after_json TEXT,
  metadata_json TEXT,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_church_time ON audit_events(church_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id, occurred_at DESC);
