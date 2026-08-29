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
  1, 'instance_42424242-1234-5678-9abc-123456789abc', 'single-church', 'church_demo',
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

-- ---------------------------------------------------------------------------
-- DIRECTORY, MINISTRY, AND FINANCE DEMO DATA
--
-- This block exists so the UI can be evaluated, not just booted. An empty
-- directory hides every layout problem that matters: truncation, wrapping,
-- column alignment, status color balance, and pagination. The rows below are
-- deliberately uneven and include the cases that break table layouts.
--
-- All addresses, emails, and phone numbers use reserved example domains and
-- 555 numbers. No real person or congregation is represented here.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO people (
  id, church_id, first_name, last_name, sort_name, email, phone,
  membership_status, volunteer_ready, notes, created_at, updated_at
) VALUES
  -- Members
  ('person_demo_01','church_demo','Ana','Powell','Powell, Ana','ana.powell@example.test','555-0101','member',1,'Serves on the welcome team.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_02','church_demo','Marcus','Whitfield','Whitfield, Marcus','marcus.whitfield@example.test','555-0102','member',1,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_03','church_demo','Priya','Raghunathan','Raghunathan, Priya','priya.r@example.test','555-0103','member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_04','church_demo','José','Álvarez','Álvarez, José','jose.alvarez@example.test','555-0104','member',1,'Prefers Spanish-language materials.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_05','church_demo','Grace','Okonkwo-Baptiste','Okonkwo-Baptiste, Grace','grace.ob@example.test',NULL,'member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_06','church_demo','Daniel','Kim','Kim, Daniel','daniel.kim@example.test','555-0106','member',1,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_07','church_demo','Ruth','Delacroix','Delacroix, Ruth','ruth.d@example.test','555-0107','member',0,'Homebound; monthly visit.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_08','church_demo','Samuel','Adeyemi','Adeyemi, Samuel','samuel.a@example.test','555-0108','member',1,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Long name: exercises truncation in the name column and the avatar initials
  ('person_demo_09','church_demo','Bartholomew','Featherstonehaugh-Villanueva','Featherstonehaugh-Villanueva, Bartholomew','b.featherstonehaugh@example.test','555-0109','member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Volunteers
  ('person_demo_10','church_demo','Naomi','Bright','Bright, Naomi','naomi.bright@example.test','555-0110','volunteer',1,'Childrens ministry background check on file.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_11','church_demo','Theo','Vasquez','Vasquez, Theo','theo.v@example.test','555-0111','volunteer',1,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_12','church_demo','Hannah','Lindqvist','Lindqvist, Hannah','hannah.l@example.test',NULL,'volunteer',1,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_13','church_demo','Oliver','Mbeki','Mbeki, Oliver','oliver.m@example.test','555-0113','volunteer',0,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Regular attenders
  ('person_demo_14','church_demo','Sofia','Marchetti','Marchetti, Sofia','sofia.m@example.test','555-0114','regular-attender',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_15','church_demo','Eli','Nakamura','Nakamura, Eli','eli.n@example.test','555-0115','regular-attender',1,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_16','church_demo','Tabitha','Okoro','Okoro, Tabitha','tabitha.o@example.test',NULL,'regular-attender',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_17','church_demo','Caleb','Fitzgerald','Fitzgerald, Caleb','caleb.f@example.test','555-0117','regular-attender',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_18','church_demo','Mei','Chen','Chen, Mei','mei.chen@example.test','555-0118','regular-attender',1,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Guests: no contact details at all, the sparsest row a directory can hold
  ('person_demo_19','church_demo','Jordan','Ellis','Ellis, Jordan',NULL,NULL,'guest',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_20','church_demo','Amara','Nwosu','Nwosu, Amara',NULL,'555-0120','guest',0,'Visited twice in the last month.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_21','church_demo','Peter','Sandoval','Sandoval, Peter','peter.s@example.test',NULL,'guest',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_22','church_demo','Leah','Abramson','Abramson, Leah','leah.a@example.test','555-0122','guest',1,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Inactive
  ('person_demo_23','church_demo','Victor','Petrov','Petrov, Victor','victor.p@example.test','555-0123','inactive',0,'Moved out of state in the spring.',unixepoch()*1000,unixepoch()*1000),
  ('person_demo_24','church_demo','Miriam','Haddad','Haddad, Miriam','miriam.h@example.test',NULL,'inactive',0,NULL,unixepoch()*1000,unixepoch()*1000),
  -- Children and youth, so households have dependents
  ('person_demo_25','church_demo','Ivy','Powell','Powell, Ivy',NULL,NULL,'member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_26','church_demo','Noah','Powell','Powell, Noah',NULL,NULL,'member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_27','church_demo','Lucia','Álvarez','Álvarez, Lucia',NULL,NULL,'member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_28','church_demo','Mateo','Álvarez','Álvarez, Mateo',NULL,NULL,'regular-attender',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_29','church_demo','Esther','Kim','Kim, Esther',NULL,NULL,'member',0,NULL,unixepoch()*1000,unixepoch()*1000),
  ('person_demo_30','church_demo','Silas','Kim','Kim, Silas',NULL,NULL,'guest',0,NULL,unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO households (
  id, church_id, name, street, city, region, postal_code, country_code, created_at, updated_at
) VALUES
  ('household_demo_01','church_demo','Powell Household','118 Cedar Street','Raleigh','NC','27601','US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_02','church_demo','Álvarez Household','4402 Mill Creek Road','Raleigh','NC','27604','US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_03','church_demo','Kim Household','29 Larkspur Lane','Cary','NC','27511','US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_04','church_demo','Whitfield Household','870 Ridgeway Avenue','Raleigh','NC','27607','US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_05','church_demo','Okonkwo-Baptiste Household','1290 Founders Row, Apartment 14B','Durham','NC','27701','US',unixepoch()*1000,unixepoch()*1000),
  -- No address on file: exercises the empty-location path in the table
  ('household_demo_06','church_demo','Ellis Household',NULL,NULL,NULL,NULL,'US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_07','church_demo','Delacroix Household','56 Waverly Place','Raleigh','NC','27603','US',unixepoch()*1000,unixepoch()*1000),
  ('household_demo_08','church_demo','Nakamura Household','733 Anselm Court','Apex','NC','27502','US',unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO household_people (
  church_id, household_id, person_id, relationship, is_primary, created_at
) VALUES
  -- Five-member household: the widest member list the detail row must handle
  ('church_demo','household_demo_01','person_demo_01','other',1,unixepoch()*1000),
  ('church_demo','household_demo_01','person_demo_02','spouse',0,unixepoch()*1000),
  ('church_demo','household_demo_01','person_demo_25','child',0,unixepoch()*1000),
  ('church_demo','household_demo_01','person_demo_26','child',0,unixepoch()*1000),
  ('church_demo','household_demo_01','person_demo_10','parent',0,unixepoch()*1000),
  ('church_demo','household_demo_02','person_demo_04','other',1,unixepoch()*1000),
  ('church_demo','household_demo_02','person_demo_27','child',0,unixepoch()*1000),
  ('church_demo','household_demo_02','person_demo_28','child',0,unixepoch()*1000),
  ('church_demo','household_demo_03','person_demo_06','other',1,unixepoch()*1000),
  ('church_demo','household_demo_03','person_demo_29','spouse',0,unixepoch()*1000),
  ('church_demo','household_demo_03','person_demo_30','child',0,unixepoch()*1000),
  ('church_demo','household_demo_04','person_demo_03','other',1,unixepoch()*1000),
  ('church_demo','household_demo_05','person_demo_05','other',1,unixepoch()*1000),
  ('church_demo','household_demo_05','person_demo_08','guardian',0,unixepoch()*1000),
  -- Household with no members at all: the empty-detail path
  ('church_demo','household_demo_07','person_demo_07','other',1,unixepoch()*1000),
  ('church_demo','household_demo_08','person_demo_15','other',1,unixepoch()*1000),
  ('church_demo','household_demo_08','person_demo_18','spouse',0,unixepoch()*1000);

INSERT OR IGNORE INTO ministries (
  id, church_id, slug, title, status, audience, schedule, featured, summary, created_at, updated_at
) VALUES
  ('ministry_demo_kids','church_demo','kids','Kids Ministry','published','Birth through 5th grade','Sunday mornings',1,'Safe, joyful formation for the youngest members of the church.',unixepoch()*1000,unixepoch()*1000),
  ('ministry_demo_youth','church_demo','youth','Youth Ministry','published','6th through 12th grade','Wednesday evenings',0,'Middle and high school discipleship, service, and friendship.',unixepoch()*1000,unixepoch()*1000),
  ('ministry_demo_care','church_demo','care','Care & Benevolence','draft','Congregation','As needed',0,'Practical care, meals, visitation, and benevolence requests.',unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO groups (
  id, church_id, ministry_id, slug, title, status, group_type, audience, schedule,
  location, enrollment_policy, capacity, featured, summary, created_at, updated_at
) VALUES
  ('group_demo_northside','church_demo','ministry_demo_groups','northside-community','Northside Community Group','published','small-group','Adults','Wednesdays at 6:30 PM','Northside','open',14,0,'Shared meals and study on the north side of town.',unixepoch()*1000,unixepoch()*1000),
  ('group_demo_young_adults','church_demo','ministry_demo_groups','young-adults','Young Adults','published','small-group','Ages 18-30','Thursdays at 7:30 PM','Church campus','request',24,1,'Community for students and early-career adults.',unixepoch()*1000,unixepoch()*1000),
  ('group_demo_mens','church_demo',NULL,'mens-morning-study','Men''s Morning Study','published','study','Men','Saturdays at 7:00 AM','Fellowship Hall','open',20,0,'Early study and prayer before the weekend.',unixepoch()*1000,unixepoch()*1000),
  ('group_demo_womens','church_demo',NULL,'womens-evening-study','Women''s Evening Study','published','study','Women','Mondays at 7:00 PM','Room 204','open',18,0,'Study, prayer, and mutual care.',unixepoch()*1000,unixepoch()*1000),
  -- At capacity: exercises a "full" state next to open groups
  ('group_demo_worship','church_demo',NULL,'worship-team','Worship Team','published','team','Auditioned volunteers','Thursdays at 7:00 PM','Sanctuary','closed',12,0,'Musicians and vocalists serving weekend gatherings.',unixepoch()*1000,unixepoch()*1000),
  ('group_demo_prayer','church_demo',NULL,'prayer-team','Prayer Team','draft','team','Congregation','Sunday mornings','Prayer Room','request',NULL,0,'Intercession before and during weekend gatherings.',unixepoch()*1000,unixepoch()*1000),
  ('group_demo_esl','church_demo','ministry_demo_care','esl-conversation','ESL Conversation Partners','archived','service','Neighbors','Tuesdays at 6:00 PM','Community Room','open',30,0,'Conversational English practice with neighbors.',unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO courses (
  id, church_id, ministry_id, slug, title, status, course_type, delivery_mode,
  audience, duration, featured, certificate_offered, summary, created_at, updated_at
) VALUES
  ('course_demo_baptism','church_demo',NULL,'baptism-class','Baptism Class','published','formation','in-person','All ages','2 sessions',0,0,'What baptism means and how the church practices it.',unixepoch()*1000,unixepoch()*1000),
  ('course_demo_finance','church_demo',NULL,'stewardship-basics','Stewardship Basics','published','formation','hybrid','Adults','6 weeks',0,1,'Generosity, budgeting, and financial discipleship.',unixepoch()*1000,unixepoch()*1000),
  ('course_demo_leaders','church_demo','ministry_demo_groups','group-leader-training','Group Leader Training','draft','leadership','cohort','Group leaders','8 weeks',0,1,'Preparation for leading a community group well.',unixepoch()*1000,unixepoch()*1000),
  ('course_demo_marriage','church_demo',NULL,'marriage-preparation','Marriage Preparation','published','formation','cohort','Engaged couples','5 weeks',1,0,'Preparation for couples planning to marry.',unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO lessons (
  id, church_id, course_id, title, summary, estimated_minutes, required, sort_order, created_at, updated_at
) VALUES
  ('lesson_demo_3','church_demo','course_demo_marriage','Expectations and Communication','Naming assumptions before they surface.',45,1,0,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_4','church_demo','course_demo_marriage','Money, Family, and Conflict','The three most common early pressures.',45,1,1,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_5','church_demo','course_demo_baptism','Why We Baptize','The meaning and history of the practice.',35,1,0,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_6','church_demo','course_demo_baptism','Preparing to Be Baptized','Practical preparation and testimony.',25,1,1,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_7','church_demo','course_demo_finance','A Theology of Generosity','Why generosity precedes budgeting.',30,1,0,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_8','church_demo','course_demo_finance','Building a Household Budget','Practical tools and worksheets.',45,1,1,unixepoch()*1000,unixepoch()*1000),
  ('lesson_demo_9','church_demo','course_demo_finance','Debt and Freedom','Approaching debt without shame.',40,0,2,unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO events (
  id, church_id, slug, title, status, summary, starts_at, ends_at, timezone, location,
  registration_url, capacity, featured, created_at, updated_at
) VALUES
  ('event_demo_baptism','church_demo','baptism-sunday','Baptism Sunday','published','Celebrating baptisms during both morning gatherings.',(unixepoch()+1209600)*1000,(unixepoch()+1219200)*1000,'America/New_York','Sanctuary',NULL,NULL,1,unixepoch()*1000,unixepoch()*1000),
  ('event_demo_serve','church_demo','neighborhood-serve-day','Neighborhood Serve Day','published','Projects with partner organizations across the city.',(unixepoch()+1814400)*1000,(unixepoch()+1839600)*1000,'America/New_York','Meet at Fellowship Hall','https://example.test/register',120,0,unixepoch()*1000,unixepoch()*1000),
  ('event_demo_womens','church_demo','womens-retreat','Women''s Fall Retreat','published','An overnight retreat of teaching, rest, and conversation.',(unixepoch()+3628800)*1000,(unixepoch()+3801600)*1000,'America/New_York','Camp Willow','https://example.test/retreat',60,0,unixepoch()*1000,unixepoch()*1000),
  ('event_demo_membership','church_demo','membership-lunch','Membership Lunch','draft','Lunch and conversation for prospective members.',(unixepoch()+2419200)*1000,(unixepoch()+2430000)*1000,'America/New_York','Room 120',NULL,40,0,unixepoch()*1000,unixepoch()*1000),
  -- Past event: exercises date formatting for elapsed dates
  ('event_demo_christmas','church_demo','christmas-eve','Christmas Eve Services','archived','Candlelight services at 4:00 and 6:00 PM.',(unixepoch()-5184000)*1000,(unixepoch()-5173200)*1000,'America/New_York','Sanctuary',NULL,NULL,0,unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO sermons (
  id, church_id, slug, title, status, speaker, series, summary, video_url, preached_at,
  featured, created_at, updated_at
) VALUES
  ('sermon_demo_cornerstone','church_demo','the-cornerstone','The Cornerstone','published','Jordan Lee','Rooted','What it means to build on something that does not move.','https://example.test/watch/cornerstone',(unixepoch()-864000)*1000,0,unixepoch()*1000,unixepoch()*1000),
  ('sermon_demo_household','church_demo','a-household-of-faith','A Household of Faith','published','Amara Osei','Rooted','Belonging as the shape of Christian life.',NULL,(unixepoch()-1468800)*1000,0,unixepoch()*1000,unixepoch()*1000),
  ('sermon_demo_welcome','church_demo','the-welcome-table','The Welcome Table','published','Jordan Lee','Table Manners','Hospitality as a practice, not a personality.','https://example.test/watch/welcome-table',(unixepoch()-2073600)*1000,0,unixepoch()*1000,unixepoch()*1000),
  ('sermon_demo_lament','church_demo','learning-to-lament','Learning to Lament','published','Ruth Delacroix',NULL,'Grief that stays honest and still prays.',NULL,(unixepoch()-2678400)*1000,0,unixepoch()*1000,unixepoch()*1000),
  ('sermon_demo_draft','church_demo','the-long-obedience','The Long Obedience','draft','Jordan Lee','Table Manners','Faithfulness measured in decades, not moments.',NULL,(unixepoch()+259200)*1000,0,unixepoch()*1000,unixepoch()*1000);

-- Contributions cover every status the schema allows, a recurring gift, and a
-- wide range of magnitudes so column alignment and tabular figures are visible.
INSERT OR IGNORE INTO contributions (
  id, church_id, person_id, donor_name, amount_minor, currency, fund, payment_method,
  status, recurring, provider, provider_payment_id, donated_at, created_at, updated_at
) VALUES
  ('contribution_demo_01','church_demo','person_demo_01','Ana Powell',25000,'USD','General','card','succeeded',1,'demo','demo_pi_0001',(unixepoch()-259200)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_02','church_demo','person_demo_02','Marcus Whitfield',1000000,'USD','Building','ach','succeeded',0,'demo','demo_pi_0002',(unixepoch()-345600)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_03','church_demo','person_demo_04','José Álvarez',7500,'USD','Benevolence','card','succeeded',1,'demo','demo_pi_0003',(unixepoch()-432000)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_04','church_demo','person_demo_06','Daniel Kim',50000,'USD','General','ach','succeeded',1,'demo','demo_pi_0004',(unixepoch()-518400)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_05','church_demo',NULL,'Anonymous',500,'USD','General','cash','succeeded',0,NULL,NULL,(unixepoch()-604800)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_06','church_demo','person_demo_10','Naomi Bright',12500,'USD','Missions','card','pending',0,'demo','demo_pi_0006',(unixepoch()-86400)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_07','church_demo','person_demo_11','Theo Vasquez',3000,'USD','General','card','failed',0,'demo','demo_pi_0007',(unixepoch()-172800)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_08','church_demo','person_demo_14','Sofia Marchetti',15000,'USD','Missions','card','refunded',0,'demo','demo_pi_0008',(unixepoch()-691200)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_09','church_demo','person_demo_15','Eli Nakamura',20000,'USD','Building','ach','succeeded',0,'demo','demo_pi_0009',(unixepoch()-777600)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_10','church_demo','person_demo_03','Priya Raghunathan',8250,'USD','General','card','succeeded',1,'demo','demo_pi_0010',(unixepoch()-864000)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_11','church_demo','person_demo_08','Samuel Adeyemi',100000,'USD','Benevolence','check','succeeded',0,NULL,NULL,(unixepoch()-950400)*1000,unixepoch()*1000,unixepoch()*1000),
  ('contribution_demo_12','church_demo','person_demo_18','Mei Chen',4500,'USD','General','card','succeeded',1,'demo','demo_pi_0012',(unixepoch()-1036800)*1000,unixepoch()*1000,unixepoch()*1000);

-- ---------------------------------------------------------------------------
-- PARTICIPATION
--
-- Rosters and enrollments so groups and courses demonstrate the workflow
-- rather than rendering as empty shells. Covers every membership status, both
-- leader roles in use, a group at capacity, and both enrollment subjects
-- (a person and a whole group).
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO group_leaders (church_id, group_id, person_id, role, created_at) VALUES
  ('church_demo','group_demo_midtown','person_demo_01','leader',unixepoch()*1000),
  ('church_demo','group_demo_midtown','person_demo_11','apprentice',unixepoch()*1000),
  ('church_demo','group_demo_northside','person_demo_06','leader',unixepoch()*1000),
  ('church_demo','group_demo_womens','person_demo_10','leader',unixepoch()*1000),
  ('church_demo','group_demo_womens','person_demo_03','host',unixepoch()*1000),
  ('church_demo','group_demo_young_adults','person_demo_15','leader',unixepoch()*1000);

INSERT OR IGNORE INTO group_memberships (
  id, church_id, group_id, person_id, status, joined_at, notes, created_at, updated_at
) VALUES
  ('groupmember_demo_01','church_demo','group_demo_midtown','person_demo_01','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_02','church_demo','group_demo_midtown','person_demo_02','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_03','church_demo','group_demo_midtown','person_demo_04','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_04','church_demo','group_demo_midtown','person_demo_11','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_05','church_demo','group_demo_midtown','person_demo_14','paused',unixepoch()*1000,'On sabbatical until the new year',unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_06','church_demo','group_demo_midtown','person_demo_22','interested',NULL,'Met at the summer picnic',unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_07','church_demo','group_demo_northside','person_demo_06','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_08','church_demo','group_demo_northside','person_demo_29','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_09','church_demo','group_demo_northside','person_demo_17','pending',NULL,'Awaiting childcare confirmation',unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_10','church_demo','group_demo_womens','person_demo_10','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_11','church_demo','group_demo_womens','person_demo_03','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_12','church_demo','group_demo_womens','person_demo_05','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_13','church_demo','group_demo_womens','person_demo_16','completed',unixepoch()*1000,'Completed the spring cohort',unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_14','church_demo','group_demo_young_adults','person_demo_15','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_15','church_demo','group_demo_young_adults','person_demo_18','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_16','church_demo','group_demo_young_adults','person_demo_28','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_17','church_demo','group_demo_young_adults','person_demo_21','interested',NULL,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_18','church_demo','group_demo_mens','person_demo_02','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_19','church_demo','group_demo_mens','person_demo_08','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('groupmember_demo_20','church_demo','group_demo_mens','person_demo_13','active',unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000);

INSERT OR IGNORE INTO course_enrollments (
  id, church_id, course_id, person_id, group_id, status, started_at, completed_at, notes, created_at, updated_at
) VALUES
  ('enrollment_demo_01','church_demo','course_demo_welcome','person_demo_19',NULL,'active',unixepoch()*1000,NULL,NULL,unixepoch()*1000,unixepoch()*1000),
  ('enrollment_demo_02','church_demo','course_demo_welcome','person_demo_20',NULL,'invited',NULL,NULL,'Invited after her second visit',unixepoch()*1000,unixepoch()*1000),
  ('enrollment_demo_03','church_demo','course_demo_welcome','person_demo_22',NULL,'completed',unixepoch()*1000,unixepoch()*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  -- A whole group enrolled together, which is how most studies actually run.
  ('enrollment_demo_04','church_demo','course_demo_finance',NULL,'group_demo_midtown','active',unixepoch()*1000,NULL,'Running as the autumn study',unixepoch()*1000,unixepoch()*1000),
  ('enrollment_demo_05','church_demo','course_demo_baptism','person_demo_21',NULL,'active',unixepoch()*1000,NULL,NULL,unixepoch()*1000,unixepoch()*1000),
  ('enrollment_demo_06','church_demo','course_demo_marriage',NULL,'group_demo_young_adults','invited',NULL,NULL,NULL,unixepoch()*1000,unixepoch()*1000);

-- ---------------------------------------------------------------------------
-- SESSIONS AND ATTENDANCE
--
-- Three weeks of one group's meetings: a fully recorded past week, a partly
-- recorded one, and an upcoming session with nothing recorded yet. That spread
-- is what makes "not recorded" visibly different from "absent" in the register.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO group_sessions (
  id, church_id, group_id, title, starts_at, ends_at, location, topic, status, created_at, updated_at
) VALUES
  ('groupsession_demo_01','church_demo','group_demo_midtown','Week 1 — Welcome',(unixepoch()-1209600)*1000,(unixepoch()-1202400)*1000,'Midtown','Introductions and expectations','submitted',unixepoch()*1000,unixepoch()*1000),
  ('groupsession_demo_02','church_demo','group_demo_midtown','Week 2 — Psalm 23',(unixepoch()-604800)*1000,(unixepoch()-597600)*1000,'Midtown','Reading and discussion','submitted',unixepoch()*1000,unixepoch()*1000),
  ('groupsession_demo_03','church_demo','group_demo_midtown','Week 3 — Shared meal',(unixepoch()+172800)*1000,(unixepoch()+180000)*1000,'Midtown',NULL,'planned',unixepoch()*1000,unixepoch()*1000),
  ('groupsession_demo_04','church_demo','group_demo_womens','Spring study — session 1',(unixepoch()-259200)*1000,NULL,'Room 204',NULL,'open',unixepoch()*1000,unixepoch()*1000);

-- Week 1: everyone recorded.
INSERT OR IGNORE INTO attendance_records (
  id, church_id, session_id, person_id, status, checked_in_at, notes, created_at, updated_at
) VALUES
  ('attendance_demo_01','church_demo','groupsession_demo_01','person_demo_01','present',(unixepoch()-1209600)*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_02','church_demo','groupsession_demo_01','person_demo_02','present',(unixepoch()-1209600)*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_03','church_demo','groupsession_demo_01','person_demo_04','present',(unixepoch()-1209600)*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_04','church_demo','groupsession_demo_01','person_demo_11','serving',(unixepoch()-1209600)*1000,'Hosting',unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_05','church_demo','groupsession_demo_01','person_demo_14','excused',NULL,'Travelling',unixepoch()*1000,unixepoch()*1000),
  -- Week 2: partly recorded, so the register shows a real mid-entry state.
  ('attendance_demo_06','church_demo','groupsession_demo_02','person_demo_01','present',(unixepoch()-604800)*1000,NULL,unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_07','church_demo','groupsession_demo_02','person_demo_02','absent',NULL,NULL,unixepoch()*1000,unixepoch()*1000),
  ('attendance_demo_08','church_demo','groupsession_demo_02','person_demo_04','present',(unixepoch()-604800)*1000,NULL,unixepoch()*1000,unixepoch()*1000);
