import 'dotenv/config'

import type { CollectionSlug } from 'payload'

import { getPayloadClient } from '@/lib/getPayloadClient'

type ExistingDoc = {
  id: number | string
}

type SeedCourse = ExistingDoc & {
  lessons?: Array<{
    id?: string | null
    title?: string | null
  }>
}

const upsertByField = async ({
  collection,
  data,
  field,
  value,
}: {
  collection: CollectionSlug
  data: Record<string, unknown>
  field: string
  value: string
}): Promise<ExistingDoc & Record<string, unknown>> => {
  const payload = await getPayloadClient()
  const existing = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    where: {
      [field]: {
        equals: value,
      },
    },
  })

  const existingDoc = existing.docs[0] as ExistingDoc | undefined

  if (existingDoc) {
    const updatedDoc = await payload.update({
      id: existingDoc.id,
      collection,
      data,
    })

    return updatedDoc as unknown as ExistingDoc & Record<string, unknown>
  }

  const createdDoc = await payload.create({
    collection,
    data,
  })

  return createdDoc as unknown as ExistingDoc & Record<string, unknown>
}

async function seed() {
  const church = await upsertByField({
    collection: 'churches',
    data: {
      name: 'Demo Fellowship',
      slug: 'demo-fellowship',
      status: 'published',
      tagline: 'A warm church website and operations workspace powered by Payload.',
      summary:
        'Demo Fellowship is a seeded church used to exercise the first Fellowship42 workflows: website publishing, ministries, events, contributions, and facilities.',
      serviceTimes: [
        { label: 'Sunday Worship', day: 'Sunday', time: '9:00 AM' },
        { label: 'Sunday Worship', day: 'Sunday', time: '11:00 AM' },
        { label: 'Wednesday Prayer', day: 'Wednesday', time: '6:30 PM' },
      ],
      address: {
        street: '120 Hope Street',
        city: 'Nashville',
        state: 'TN',
        postalCode: '37203',
      },
      contact: {
        phone: '(615) 555-0142',
        email: 'hello@demofellowship.org',
        website: 'https://demofellowship.org',
      },
      givingUrl: 'https://example.com/give/demo-fellowship',
      livestreamUrl: 'https://example.com/live/demo-fellowship',
      theme: {
        preset: 'warm',
        accent: '#a95534',
        surface: '#f5ebdf',
        ink: '#1b130f',
        heroTone: 'warm',
        radius: 'rounded',
        headingFont: 'serif-display',
        bodyFont: 'classic-serif',
      },
    },
    field: 'slug',
    value: 'demo-fellowship',
  })

  await upsertByField({
    collection: 'users',
    data: {
      email: 'admin@fellowship42.local',
      password: 'changeme123',
      firstName: 'Jordan',
      lastName: 'Fields',
      roles: ['super-admin', 'church-admin'],
      churches: [church.id],
    },
    field: 'email',
    value: 'admin@fellowship42.local',
  })
  const people = await Promise.all([
    upsertByField({
      collection: 'people',
      data: {
        church: church.id,
        firstName: 'Ava',
        lastName: 'Mitchell',
        email: 'ava@demofellowship.org',
        phone: '(615) 555-0180',
        householdName: 'Mitchell Household',
        membershipStatus: 'member',
        volunteerReady: true,
      },
      field: 'email',
      value: 'ava@demofellowship.org',
    }),
    upsertByField({
      collection: 'people',
      data: {
        church: church.id,
        firstName: 'Noah',
        lastName: 'Bennett',
        email: 'noah@demofellowship.org',
        phone: '(615) 555-0181',
        householdName: 'Bennett Household',
        membershipStatus: 'regular-attender',
        volunteerReady: false,
      },
      field: 'email',
      value: 'noah@demofellowship.org',
    }),
  ])

  await Promise.all([
    upsertByField({
      collection: 'users',
      data: {
        email: 'leader@fellowship42.local',
        password: 'changeme123',
        firstName: 'Ava',
        lastName: 'Mitchell',
        roles: ['ministry-leader'],
        churches: [church.id],
        person: people[0]?.id,
      },
      field: 'email',
      value: 'leader@fellowship42.local',
    }),
    upsertByField({
      collection: 'users',
      data: {
        email: 'member@fellowship42.local',
        password: 'changeme123',
        firstName: 'Noah',
        lastName: 'Bennett',
        roles: ['member'],
        churches: [church.id],
        person: people[1]?.id,
      },
      field: 'email',
      value: 'member@fellowship42.local',
    }),
  ])

  const ministries = await Promise.all([
    upsertByField({
      collection: 'ministries',
      data: {
        church: church.id,
        title: 'Kids Ministry',
        slug: 'kids-ministry',
        status: 'published',
        audience: 'Families',
        schedule: 'Sundays during both worship gatherings',
        featured: true,
        summary: 'A secure and welcoming environment for infants through fifth grade.',
      },
      field: 'slug',
      value: 'kids-ministry',
    }),
    upsertByField({
      collection: 'ministries',
      data: {
        church: church.id,
        title: 'Young Adults',
        slug: 'young-adults',
        status: 'published',
        audience: 'College and early career',
        schedule: 'Tuesdays at 7:00 PM',
        featured: true,
        summary: 'Weekly gathering for scripture, prayer, and shared meals.',
      },
      field: 'slug',
      value: 'young-adults',
    }),
  ])

  const kidsMinistry = ministries[0]
  const youngAdultsMinistry = ministries[1]

  const groups = await Promise.all([
    upsertByField({
      collection: 'groups',
      data: {
        church: church.id,
        ministry: kidsMinistry?.id,
        title: 'Foundations Sunday School',
        slug: 'foundations-sunday-school',
        status: 'published',
        groupType: 'sunday-school',
        audience: 'Adults and new attenders',
        schedule: 'Sundays at 9:00 AM',
        location: 'Room 204',
        openEnrollment: true,
        featured: true,
        capacity: 24,
        leaders: people.map((person) => person.id),
        summary: 'A weekly Bible teaching class that helps newcomers build core doctrine and friendships.',
      },
      field: 'slug',
      value: 'foundations-sunday-school',
    }),
    upsertByField({
      collection: 'groups',
      data: {
        church: church.id,
        ministry: youngAdultsMinistry?.id,
        title: 'Tuesday Night Table Group',
        slug: 'tuesday-night-table-group',
        status: 'published',
        groupType: 'small-group',
        audience: 'Young adults',
        schedule: 'Tuesdays at 7:00 PM',
        location: 'The Bennett home',
        openEnrollment: true,
        featured: true,
        capacity: 12,
        leaders: [people[1]?.id],
        summary: 'Shared meals, prayer, and discussion built around the sermon and weekly scripture reading.',
      },
      field: 'slug',
      value: 'tuesday-night-table-group',
    }),
    upsertByField({
      collection: 'groups',
      data: {
        church: church.id,
        ministry: kidsMinistry?.id,
        title: 'Kids Volunteer Prep Cohort',
        slug: 'kids-volunteer-prep-cohort',
        status: 'published',
        groupType: 'training-cohort',
        audience: 'Prospective kids volunteers',
        schedule: 'First and third Wednesdays at 6:30 PM',
        location: 'Family wing classroom',
        openEnrollment: false,
        featured: false,
        capacity: 10,
        leaders: [people[0]?.id],
        summary: 'A guided cohort for training, policies, and safety preparation before serving with kids.',
      },
      field: 'slug',
      value: 'kids-volunteer-prep-cohort',
    }),
  ])

  const courses = await Promise.all([
    upsertByField({
      collection: 'courses',
      data: {
        church: church.id,
        ministry: kidsMinistry?.id,
        title: 'Kids Team Readiness',
        slug: 'kids-team-readiness',
        status: 'published',
        courseType: 'volunteer-training',
        deliveryMode: 'hybrid',
        audience: 'Current and prospective kids volunteers',
        duration: '4 weeks',
        featured: true,
        certificateOffered: true,
        summary: 'A blended volunteer training path covering culture, classroom expectations, safety, and family communication.',
        lessons: [
          {
            title: 'Why We Serve Children',
            summary: 'Vision, culture, and expectations for discipleship in family ministry.',
            content: [
              {
                children: [{ text: 'Introduce the mission, culture, and expectations for serving children well.' }],
                type: 'paragraph',
                version: 1,
              },
            ],
            estimatedMinutes: 20,
            required: true,
          },
          {
            title: 'Safety and Check-In',
            summary: 'Pickup protocol, allergies, emergency response, and classroom handoff standards.',
            content: [
              {
                children: [{ text: 'Review safety policy, classroom coverage, and escalation procedure.' }],
                type: 'paragraph',
                version: 1,
              },
            ],
            estimatedMinutes: 30,
            required: true,
          },
        ],
      },
      field: 'slug',
      value: 'kids-team-readiness',
    }),
    upsertByField({
      collection: 'courses',
      data: {
        church: church.id,
        ministry: youngAdultsMinistry?.id,
        title: 'Starting Point Membership',
        slug: 'starting-point-membership',
        status: 'published',
        courseType: 'new-member',
        deliveryMode: 'group-led',
        audience: 'Guests and regular attenders considering membership',
        duration: '3 sessions',
        featured: true,
        certificateOffered: false,
        summary: 'A guided next-step course covering church story, doctrine, covenant, and serving pathways.',
        lessons: [
          {
            title: 'Our Story and Beliefs',
            summary: 'Church history, beliefs, and mission.',
            content: [
              {
                children: [{ text: 'Walk through the church story, convictions, and local mission.' }],
                type: 'paragraph',
                version: 1,
              },
            ],
            estimatedMinutes: 25,
            required: true,
          },
          {
            title: 'Membership and Next Steps',
            summary: 'Membership covenant, serving, and discipleship rhythm.',
            content: [
              {
                children: [{ text: 'Explain expectations, membership process, and ways to get involved.' }],
                type: 'paragraph',
                version: 1,
              },
            ],
            estimatedMinutes: 25,
            required: true,
          },
        ],
      },
      field: 'slug',
      value: 'starting-point-membership',
    }),
    upsertByField({
      collection: 'courses',
      data: {
        church: church.id,
        ministry: youngAdultsMinistry?.id,
        title: 'Romans Bible Study Library',
        slug: 'romans-bible-study-library',
        status: 'published',
        courseType: 'curriculum',
        deliveryMode: 'self-paced',
        audience: 'Leaders and group hosts',
        duration: '8 lessons',
        featured: false,
        certificateOffered: false,
        summary: 'A reusable lesson library for small groups or Sunday school leaders teaching through Romans.',
        lessons: [
          {
            title: 'Romans 1-2 Overview',
            summary: 'Introduce the gospel, human need, and Paul’s argument.',
            content: [
              {
                children: [{ text: 'Lesson notes, discussion prompts, and leader preparation material.' }],
                type: 'paragraph',
                version: 1,
              },
            ],
            estimatedMinutes: 35,
            required: true,
          },
        ],
      },
      field: 'slug',
      value: 'romans-bible-study-library',
    }),
  ])

  const kidsCourse = courses[0] as SeedCourse
  const membershipCourse = courses[1] as SeedCourse

  await Promise.all([
    upsertByField({
      collection: 'landing-pages',
      data: {
        church: church.id,
        title: 'Kids Ministry Landing Page',
        slug: 'kids-ministry-page',
        status: 'published',
        pageType: 'ministry',
        ministry: kidsMinistry?.id,
        themeMode: 'custom',
        themeOverrides: {
          accent: '#8c4f1d',
          surface: '#f9efe1',
          ink: '#20120a',
          heroTone: 'warm',
        },
        seoDescription: 'Learn about family ministry, volunteer onboarding, and kids environments.',
        blocks: [
          {
            blockType: 'hero',
            headline: 'A safe, joyful place for kids to know Jesus.',
            eyebrow: 'Family ministry',
            body: 'Parents should be able to understand the environment, the leaders, and the next step in under a minute.',
            primaryLabel: 'Plan a family visit',
            primaryHref: '/churches/demo-fellowship',
            secondaryLabel: 'Volunteer training',
            secondaryHref: '/churches/demo-fellowship/courses/kids-team-readiness',
          },
          {
            blockType: 'featureList',
            title: 'What families care about most',
            intro: 'This page is block-based, but it still inherits the core church theme unless you override it.',
            items: [
              {
                title: 'Secure check-in',
                body: 'Pickup, allergy notes, and classroom handoff policies are explained clearly.',
              },
              {
                title: 'Age-based environments',
                body: 'Visitors can quickly find out what happens for preschool, elementary, and special events.',
              },
              {
                title: 'Volunteer pathway',
                body: 'Prospective volunteers can move directly into a training cohort and lesson-based onboarding.',
              },
            ],
          },
          {
            blockType: 'leaderCards',
            title: 'Meet the leaders',
            intro: 'Families can see who serves in this ministry before the first visit.',
            leaders: [people[0]?.id],
          },
          {
            blockType: 'signupForm',
            title: 'Plan a family visit',
            body: 'Share a few details and the kids team will be ready to welcome your family on Sunday.',
            formType: 'plan-visit',
            buttonLabel: 'Start with the church portal',
            buttonHref: '/portal',
            emailDestination: 'hello@demofellowship.org',
            helperText: 'For MVP purposes this routes people into the portal or church email rather than a custom form builder.',
          },
          {
            blockType: 'relatedFeed',
            title: 'Volunteer and discipleship pathways',
            intro: 'These feeds stay synced to the underlying church records instead of being curated manually.',
            feedType: 'courses',
            scope: 'ministry',
            limit: 3,
          },
        ],
      },
      field: 'slug',
      value: 'kids-ministry-page',
    }),
    upsertByField({
      collection: 'landing-pages',
      data: {
        church: church.id,
        title: 'Foundations Sunday School Landing Page',
        slug: 'foundations-sunday-school-page',
        status: 'published',
        pageType: 'group',
        group: groups[0]?.id,
        themeMode: 'inherit',
        seoDescription: 'Weekly adult Sunday school class for newcomers and members.',
        blocks: [
          {
            blockType: 'hero',
            headline: 'Build friendships and biblical foundations on Sunday morning.',
            eyebrow: 'Sunday school class',
            body: 'This group page inherits the church theme and adds a simple hero plus church-specific content blocks.',
            primaryLabel: 'Join this class',
            primaryHref: '/portal',
          },
          {
            blockType: 'faq',
            title: 'Frequently asked questions',
            questions: [
              {
                question: 'Who is this class for?',
                answer: 'Adults, newcomers, and members who want a relational setting for doctrine and discussion.',
              },
              {
                question: 'What should I expect?',
                answer: 'Teaching, conversation, prayer, and a clear next step into church life.',
              },
            ],
          },
          {
            blockType: 'testimonials',
            title: 'Why people stay in this class',
            intro: 'Landing pages can mix structured schedule data with story-driven social proof.',
            items: [
              {
                name: 'Noah Bennett',
                role: 'Regular attender',
                quote: 'This class made it easy to learn doctrine and meet people in one place.',
              },
              {
                name: 'Ava Mitchell',
                role: 'Ministry leader',
                quote: 'It works well as a first relational step before serving or membership.',
              },
            ],
          },
          {
            blockType: 'signupForm',
            title: 'Join this class this Sunday',
            body: 'Members can self-serve in the portal, while newcomers still have a clear guided next step.',
            formType: 'join-group',
            buttonLabel: 'Open member portal',
            buttonHref: '/portal',
            emailDestination: 'hello@demofellowship.org',
            helperText: 'Leaders can follow up manually until a dedicated registration block is added.',
          },
        ],
      },
      field: 'slug',
      value: 'foundations-sunday-school-page',
    }),
    upsertByField({
      collection: 'landing-pages',
      data: {
        church: church.id,
        title: 'Starting Point Membership Landing Page',
        slug: 'starting-point-membership-page',
        status: 'published',
        pageType: 'course',
        course: membershipCourse?.id,
        themeMode: 'custom',
        themeOverrides: {
          accent: '#305c74',
          surface: '#e9f2f5',
          ink: '#12232b',
          heroTone: 'calm',
        },
        seoDescription: 'Membership pathway, beliefs, covenant, and serving next steps.',
        blocks: [
          {
            blockType: 'hero',
            headline: 'Move from first visit to meaningful belonging.',
            eyebrow: 'Membership pathway',
            body: 'Use landing pages for persuasive explanation while the structured course object still owns lessons and progress tracking.',
            primaryLabel: 'Start in portal',
            primaryHref: '/portal/courses/starting-point-membership',
          },
          {
            blockType: 'copy',
            title: 'Why this format works',
            body: 'Church staff can edit the landing page copy and CTA without losing the core lesson structure that powers member progress.',
          },
          {
            blockType: 'testimonials',
            title: 'What newcomers want clarified',
            items: [
              {
                name: 'First-time families',
                role: 'Common question',
                quote: 'What exactly happens between attending a service and becoming a member?',
              },
              {
                name: 'Team leaders',
                role: 'Common question',
                quote: 'How do we guide people into serving after they complete the class?',
              },
            ],
          },
          {
            blockType: 'relatedFeed',
            title: 'Upcoming next steps',
            intro: 'Use a live feed to pull in nearby events that pair naturally with the membership track.',
            feedType: 'events',
            scope: 'church',
            limit: 2,
          },
        ],
      },
      field: 'slug',
      value: 'starting-point-membership-page',
    }),
  ])

  const sessions: Array<ExistingDoc & Record<string, unknown>> = await Promise.all([
    upsertByField({
      collection: 'events',
      data: {
        church: church.id,
        title: 'Serve Day',
        slug: 'serve-day',
        status: 'published',
        summary: 'A church-wide morning of neighborhood cleanups and local partnership projects.',
        startDate: '2026-04-18T14:00:00.000Z',
        endDate: '2026-04-18T18:00:00.000Z',
        location: 'Church campus and local partner sites',
        registrationUrl: 'https://example.com/register/serve-day',
        featured: true,
      },
      field: 'slug',
      value: 'serve-day',
    }),
    upsertByField({
      collection: 'events',
      data: {
        church: church.id,
        title: 'Membership Lunch',
        slug: 'membership-lunch',
        status: 'published',
        summary: 'A simple next step for newcomers to meet leaders and learn the church story.',
        startDate: '2026-04-26T17:30:00.000Z',
        endDate: '2026-04-26T19:00:00.000Z',
        location: 'Fellowship Hall',
        registrationUrl: 'https://example.com/register/membership-lunch',
        featured: false,
      },
      field: 'slug',
      value: 'membership-lunch',
    }),
    upsertByField({
      collection: 'sermons',
      data: {
        church: church.id,
        title: 'Faithful in the Small Things',
        slug: 'faithful-in-the-small-things',
        status: 'published',
        speaker: 'Pastor Jordan Fields',
        series: 'Steady Grace',
        summary: 'A practical message on everyday obedience, patience, and trust.',
        videoUrl: 'https://example.com/watch/faithful-in-the-small-things',
        preachedAt: '2026-03-08T15:00:00.000Z',
      },
      field: 'slug',
      value: 'faithful-in-the-small-things',
    }),
    upsertByField({
      collection: 'facilities',
      data: {
        church: church.id,
        name: 'Fellowship Hall',
        roomType: 'multipurpose',
        capacity: 180,
        availability: 'available',
        notes: 'Configured for meals, classes, and special events.',
      },
      field: 'name',
      value: 'Fellowship Hall',
    }),
    upsertByField({
      collection: 'contributions',
      data: {
        church: church.id,
        person: people[0]?.id,
        donorName: 'Ava Mitchell',
        amount: 250,
        fund: 'general',
        paymentMethod: 'card',
        status: 'succeeded',
        recurring: true,
        donatedAt: '2026-03-03T14:45:00.000Z',
      },
      field: 'donorName',
      value: 'Ava Mitchell',
    }),
    upsertByField({
      collection: 'course-enrollments',
      data: {
        church: church.id,
        course: kidsCourse?.id,
        person: people[0]?.id,
        group: groups[2]?.id,
        status: 'active',
        progressPercent: 50,
        completedLessons: [
          {
            lessonID: String(kidsCourse?.lessons?.[0]?.id ?? ''),
            title: String(kidsCourse?.lessons?.[0]?.title ?? 'Why We Serve Children'),
            completedAt: '2026-03-10T14:00:00.000Z',
          },
        ],
        startedAt: '2026-03-10T12:00:00.000Z',
        notes: 'Halfway through training and scheduled for classroom shadowing next week.',
      },
      field: 'notes',
      value: 'Halfway through training and scheduled for classroom shadowing next week.',
    }),
    upsertByField({
      collection: 'course-enrollments',
      data: {
        church: church.id,
        course: membershipCourse?.id,
        person: people[1]?.id,
        group: groups[0]?.id,
        status: 'completed',
        progressPercent: 100,
        completedLessons: [
          {
            lessonID: String(membershipCourse?.lessons?.[0]?.id ?? ''),
            title: String(membershipCourse?.lessons?.[0]?.title ?? 'Our Story and Beliefs'),
            completedAt: '2026-02-22T12:00:00.000Z',
          },
          {
            lessonID: String(membershipCourse?.lessons?.[1]?.id ?? ''),
            title: String(membershipCourse?.lessons?.[1]?.title ?? 'Membership and Next Steps'),
            completedAt: '2026-03-01T12:00:00.000Z',
          },
        ],
        startedAt: '2026-02-15T12:00:00.000Z',
        completedAt: '2026-03-01T12:00:00.000Z',
        notes: 'Completed membership track and scheduled elder follow-up.',
      },
      field: 'notes',
      value: 'Completed membership track and scheduled elder follow-up.',
    }),
    upsertByField({
      collection: 'group-memberships',
      data: {
        church: church.id,
        group: groups[0]?.id,
        person: people[1]?.id,
        role: 'member',
        status: 'active',
        joinedAt: '2026-02-02T15:00:00.000Z',
        notes: 'Joined after first-time guest follow-up.',
      },
      field: 'notes',
      value: 'Joined after first-time guest follow-up.',
    }),
    upsertByField({
      collection: 'group-memberships',
      data: {
        church: church.id,
        group: groups[0]?.id,
        person: people[0]?.id,
        role: 'leader',
        status: 'active',
        joinedAt: '2025-11-10T15:00:00.000Z',
        notes: 'Primary teacher and discussion leader.',
      },
      field: 'notes',
      value: 'Primary teacher and discussion leader.',
    }),
    upsertByField({
      collection: 'group-memberships',
      data: {
        church: church.id,
        group: groups[1]?.id,
        person: people[1]?.id,
        role: 'host',
        status: 'active',
        joinedAt: '2026-01-09T15:00:00.000Z',
        notes: 'Hosts and coordinates weekly meals.',
      },
      field: 'notes',
      value: 'Hosts and coordinates weekly meals.',
    }),
    upsertByField({
      collection: 'group-sessions',
      data: {
        church: church.id,
        group: groups[0]?.id,
        title: 'Foundations: Gospel Basics',
        sessionDate: '2026-03-08T14:00:00.000Z',
        location: 'Room 204',
        topic: 'Discussion on grace, faith, and church belonging.',
        attendanceStatus: 'submitted',
      },
      field: 'title',
      value: 'Foundations: Gospel Basics',
    }),
    upsertByField({
      collection: 'group-sessions',
      data: {
        church: church.id,
        group: groups[0]?.id,
        title: 'Foundations: Prayer and Scripture',
        sessionDate: '2026-03-15T14:00:00.000Z',
        location: 'Room 204',
        topic: 'Next week preparation for daily prayer and Bible reading.',
        attendanceStatus: 'planned',
      },
      field: 'title',
      value: 'Foundations: Prayer and Scripture',
    }),
    upsertByField({
      collection: 'group-sessions',
      data: {
        church: church.id,
        group: groups[1]?.id,
        title: 'Table Group: Romans 5',
        sessionDate: '2026-03-10T23:00:00.000Z',
        location: 'The Bennett home',
        topic: 'Read Romans 5 together and shared prayer requests.',
        attendanceStatus: 'submitted',
      },
      field: 'title',
      value: 'Table Group: Romans 5',
    }),
    upsertByField({
      collection: 'group-sessions',
      data: {
        church: church.id,
        group: groups[2]?.id,
        title: 'Kids Prep: Safety Walkthrough',
        sessionDate: '2026-03-11T22:30:00.000Z',
        location: 'Family wing classroom',
        topic: 'Review check-in flow and emergency escalation.',
        attendanceStatus: 'submitted',
      },
      field: 'title',
      value: 'Kids Prep: Safety Walkthrough',
    }),
  ])

  const foundationsSession = sessions[0]
  const foundationsUpcomingSession = sessions[1]
  const tableGroupSession = sessions[2]
  const kidsPrepSession = sessions[3]

  await Promise.all([
    upsertByField({
      collection: 'attendance-records',
      data: {
        church: church.id,
        group: groups[1]?.id,
        session: tableGroupSession?.id,
        person: people[1]?.id,
        status: 'present',
        checkedInAt: '2026-03-10T23:05:00.000Z',
        notes: 'Participated in discussion and follow-up prayer.',
      },
      field: 'notes',
      value: 'Participated in discussion and follow-up prayer.',
    }),
    upsertByField({
      collection: 'attendance-records',
      data: {
        church: church.id,
        group: groups[2]?.id,
        session: kidsPrepSession?.id,
        person: people[0]?.id,
        status: 'present',
        checkedInAt: '2026-03-11T22:33:00.000Z',
        notes: 'Completed safety walkthrough and check-in simulation.',
      },
      field: 'notes',
      value: 'Completed safety walkthrough and check-in simulation.',
    }),
    upsertByField({
      collection: 'attendance-records',
      data: {
        church: church.id,
        group: groups[0]?.id,
        session: foundationsSession?.id,
        person: people[0]?.id,
        status: 'present',
        checkedInAt: '2026-03-08T14:02:00.000Z',
        notes: 'Led the class and opened with prayer.',
      },
      field: 'notes',
      value: 'Led the class and opened with prayer.',
    }),
    upsertByField({
      collection: 'attendance-records',
      data: {
        church: church.id,
        group: groups[0]?.id,
        session: foundationsUpcomingSession?.id,
        person: people[1]?.id,
        status: 'excused',
        checkedInAt: '2026-03-14T14:00:00.000Z',
        notes: 'Marked excused in advance for travel.',
      },
      field: 'notes',
      value: 'Marked excused in advance for travel.',
    }),
  ])

  console.log('Seed complete.')
  console.log('Admin login: admin@fellowship42.local / changeme123')
  console.log('Leader login: leader@fellowship42.local / changeme123')
  console.log('Member login: member@fellowship42.local / changeme123')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
