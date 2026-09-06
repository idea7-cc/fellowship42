-- Independent records must not share their parent's edit version.
ALTER TABLE group_memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE group_leaders ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE group_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attendance_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE course_enrollments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
