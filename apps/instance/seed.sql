PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO churches (
  id, slug, name, status, plan, timezone, locale, created_at, updated_at
) VALUES (
  'church_demo', 'fellowship-demo', 'Fellowship Demo Church', 'published', 'community',
  'America/New_York', 'en-US', unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO church_profiles (
  church_id, tagline, summary, street, city, region, postal_code, country_code,
  email, website_url, theme_preset, theme_accent, theme_surface, theme_ink,
  theme_hero_tone, theme_radius, theme_heading_font, theme_body_font, updated_at
) VALUES (
  'church_demo', 'A place to belong and grow',
  'A seeded church for local Fellowship42 development and product demos.',
  '42 Fellowship Way', 'Raleigh', 'NC', '27601', 'US',
  'hello@example.test', 'https://example.test', 'warm', '#b85c38', '#f4ede3', '#1d120c',
  'warm', 'rounded', 'serif-display', 'classic-serif', unixepoch() * 1000
);

INSERT OR IGNORE INTO instance_metadata (
  singleton, instance_id, topology, primary_church_id, created_at, updated_at
) VALUES (
  1, 'instance_demo', 'single-church', 'church_demo',
  unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO service_times (
  id, church_id, label, day_of_week, local_time, sort_order, created_at, updated_at
) VALUES
  ('service_demo_1', 'church_demo', 'Sunday Worship', 0, '10:00', 0, unixepoch() * 1000, unixepoch() * 1000),
  ('service_demo_2', 'church_demo', 'Wednesday Gathering', 3, '18:30', 1, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO users (
  id, email, first_name, last_name, status, created_at, updated_at
) VALUES (
  'user_demo_owner', 'owner@example.test', 'Demo', 'Owner', 'active', unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO church_memberships (
  id, church_id, user_id, status, joined_at, created_at, updated_at
) VALUES (
  'membership_demo_owner', 'church_demo', 'user_demo_owner', 'active', unixepoch() * 1000,
  unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO roles (
  id, church_id, key, name, description, is_system, created_at, updated_at
) VALUES
  ('role_demo_owner', 'church_demo', 'owner', 'Owner', 'Full church administration', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('role_demo_finance', 'church_demo', 'finance', 'Finance', 'Giving and finance access', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('role_demo_leader', 'church_demo', 'ministry-leader', 'Ministry leader', 'Ministry and group management', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('role_demo_member', 'church_demo', 'member', 'Member', 'Member portal access', 1, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES
  ('role_demo_owner', '*'),
  ('role_demo_finance', 'contributions.read'),
  ('role_demo_finance', 'contributions.write'),
  ('role_demo_leader', 'people.read'),
  ('role_demo_leader', 'groups.write'),
  ('role_demo_leader', 'courses.write'),
  ('role_demo_leader', 'events.write'),
  ('role_demo_leader', 'sermons.write'),
  ('role_demo_leader', 'media.write'),
  ('role_demo_leader', 'attendance.write'),
  ('role_demo_member', 'profile.read');

INSERT OR IGNORE INTO membership_roles (
  church_id, membership_id, role_id, assigned_at, assigned_by_user_id
) VALUES (
  'church_demo', 'membership_demo_owner', 'role_demo_owner', unixepoch() * 1000, 'user_demo_owner'
);

INSERT OR IGNORE INTO ministries (
  id, church_id, slug, title, status, audience, schedule, featured, summary, created_at, updated_at
) VALUES (
  'ministry_demo_groups', 'church_demo', 'community-groups', 'Community Groups', 'published',
  'Adults', 'Weekly in homes', 1, 'Smaller communities for friendship, prayer, and formation.',
  unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO groups (
  id, church_id, ministry_id, slug, title, status, group_type, audience, schedule,
  location, enrollment_policy, capacity, featured, summary, created_at, updated_at
) VALUES (
  'group_demo_midtown', 'church_demo', 'ministry_demo_groups', 'midtown-community',
  'Midtown Community Group', 'published', 'small-group', 'Adults', 'Tuesdays at 7:00 PM',
  'Midtown', 'open', 16, 1, 'A weekly table-centered community in Midtown.',
  unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO courses (
  id, church_id, ministry_id, slug, title, status, course_type, delivery_mode,
  audience, duration, featured, certificate_offered, summary, created_at, updated_at
) VALUES (
  'course_demo_welcome', 'church_demo', NULL, 'welcome-to-fellowship', 'Welcome to Fellowship',
  'published', 'new-member', 'cohort', 'Newcomers', '4 weeks', 1, 0,
  'An introduction to the church, its story, beliefs, and community.',
  unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO lessons (
  id, church_id, course_id, title, summary, estimated_minutes, required, sort_order, created_at, updated_at
) VALUES
  ('lesson_demo_1', 'church_demo', 'course_demo_welcome', 'Our Story', 'Where this community came from.', 20, 1, 0, unixepoch() * 1000, unixepoch() * 1000),
  ('lesson_demo_2', 'church_demo', 'course_demo_welcome', 'Our Practices', 'How we worship, serve, and grow.', 25, 1, 1, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO events (
  id, church_id, slug, title, status, summary, starts_at, ends_at, timezone, location,
  featured, created_at, updated_at
) VALUES (
  'event_demo_picnic', 'church_demo', 'summer-picnic', 'Summer Church Picnic', 'published',
  'Food, games, and an easy afternoon together.',
  (unixepoch() + 604800) * 1000, (unixepoch() + 619200) * 1000,
  'America/New_York', 'Oak Park', 1, unixepoch() * 1000, unixepoch() * 1000
);

INSERT OR IGNORE INTO sermons (
  id, church_id, slug, title, status, speaker, series, summary, preached_at,
  featured, created_at, updated_at
) VALUES (
  'sermon_demo_hope', 'church_demo', 'a-living-hope', 'A Living Hope', 'published',
  'Jordan Lee', 'Rooted', 'Hope that changes how a community lives.',
  (unixepoch() - 259200) * 1000, 1, unixepoch() * 1000, unixepoch() * 1000
);
