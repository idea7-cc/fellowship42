import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  attendanceStatus,
  borderRadius,
  brandPreset,
  churchTheme,
  courseType,
  dayOfWeek,
  deliveryMode,
  enrollmentStatus,
  fontFamily,
  fundType,
  groupMemberRole,
  groupMemberStatus,
  groupType,
  heroTone,
  landingPageBlock,
  mediaType,
  membershipStatus,
  pageType,
  paymentMethod,
  paymentStatus,
  publishStatus,
  roomAvailability,
  roomType,
  sessionStatus,
  themeMode,
  userRole,
} from "./lib/validators";

export default defineSchema({
  // ── Churches ──────────────────────────────────────────────────────────
  churches: defineTable({
    name: v.string(),
    slug: v.string(),
    status: publishStatus,
    tagline: v.string(),
    summary: v.string(),
    heroImage: v.optional(v.id("media")),
    serviceTimes: v.array(
      v.object({
        label: v.string(),
        day: dayOfWeek,
        time: v.string(),
      })
    ),
    address: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
    }),
    contact: v.object({
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
    givingUrl: v.optional(v.string()),
    livestreamUrl: v.optional(v.string()),
    theme: churchTheme,
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  // ── Users ─────────────────────────────────────────────────────────────
  // The `tokenIdentifier` comes from ctx.auth.getUserIdentity().tokenIdentifier
  // and is provider-agnostic (works with Clerk, WorkOS, Auth0, etc.)
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    avatarUrl: v.optional(v.string()),
    roles: v.array(userRole),
    churchIds: v.array(v.id("churches")),
    personId: v.optional(v.id("people")),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // ── People ────────────────────────────────────────────────────────────
  people: defineTable({
    churchId: v.id("churches"),
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    householdName: v.optional(v.string()),
    membershipStatus: membershipStatus,
    volunteerReady: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_email", ["churchId", "email"])
    .index("by_church_and_status", ["churchId", "membershipStatus"])
    .searchIndex("search_name", {
      searchField: "fullName",
      filterFields: ["churchId", "membershipStatus"],
    }),

  // ── Media ─────────────────────────────────────────────────────────────
  media: defineTable({
    churchId: v.optional(v.id("churches")),
    resourceType: mediaType,
    alt: v.string(),
    storageId: v.id("_storage"),
    url: v.optional(v.string()),
  }).index("by_church", ["churchId"]),

  // ── Ministries ────────────────────────────────────────────────────────
  ministries: defineTable({
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    audience: v.string(),
    schedule: v.string(),
    featured: v.boolean(),
    summary: v.string(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_church_and_status", ["churchId", "status"]),

  // ── Groups ────────────────────────────────────────────────────────────
  groups: defineTable({
    churchId: v.id("churches"),
    ministryId: v.optional(v.id("ministries")),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    groupType: groupType,
    audience: v.string(),
    schedule: v.string(),
    location: v.optional(v.string()),
    openEnrollment: v.boolean(),
    featured: v.boolean(),
    capacity: v.optional(v.number()),
    leaderIds: v.array(v.id("people")),
    summary: v.string(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_ministry", ["ministryId"])
    .index("by_church_and_status", ["churchId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["churchId", "status"],
    }),

  // ── Group Memberships ─────────────────────────────────────────────────
  groupMemberships: defineTable({
    churchId: v.id("churches"),
    groupId: v.id("groups"),
    personId: v.id("people"),
    role: groupMemberRole,
    status: groupMemberStatus,
    joinedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_church", ["churchId"])
    .index("by_group", ["groupId"])
    .index("by_person", ["personId"])
    .index("by_group_and_person", ["groupId", "personId"]),

  // ── Group Sessions ────────────────────────────────────────────────────
  groupSessions: defineTable({
    churchId: v.id("churches"),
    groupId: v.id("groups"),
    title: v.string(),
    sessionDate: v.number(),
    location: v.optional(v.string()),
    topic: v.optional(v.string()),
    attendanceStatus: sessionStatus,
  })
    .index("by_church", ["churchId"])
    .index("by_group", ["groupId"])
    .index("by_group_and_date", ["groupId", "sessionDate"]),

  // ── Attendance Records ────────────────────────────────────────────────
  attendanceRecords: defineTable({
    churchId: v.id("churches"),
    groupId: v.id("groups"),
    sessionId: v.id("groupSessions"),
    personId: v.id("people"),
    status: attendanceStatus,
    checkedInAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_church", ["churchId"])
    .index("by_session", ["sessionId"])
    .index("by_person", ["personId"]),

  // ── Courses ───────────────────────────────────────────────────────────
  // Lessons are stored in their own table (see `lessons` below).
  // `lessonCount` is a denormalized counter maintained by lesson mutations.
  courses: defineTable({
    churchId: v.id("churches"),
    ministryId: v.optional(v.id("ministries")),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    courseType: courseType,
    deliveryMode: deliveryMode,
    audience: v.string(),
    duration: v.string(),
    featured: v.boolean(),
    certificateOffered: v.boolean(),
    summary: v.string(),
    lessonCount: v.number(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_ministry", ["ministryId"])
    .index("by_church_and_status", ["churchId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["churchId", "status"],
    }),

  // ── Lessons ───────────────────────────────────────────────────────────
  // Extracted from the old `courses.lessons` embedded array to avoid the
  // Convex 1 MB document-size limit and enable individual-lesson updates.
  lessons: defineTable({
    churchId: v.id("churches"),
    courseId: v.id("courses"),
    title: v.string(),
    summary: v.string(),
    content: v.optional(v.string()),
    resourceId: v.optional(v.id("media")),
    estimatedMinutes: v.optional(v.number()),
    required: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_course_and_order", ["courseId", "sortOrder"])
    .index("by_church", ["churchId"]),

  // ── Course Enrollments ────────────────────────────────────────────────
  // Lesson completion tracking is now in `lessonCompletions`.
  // `completedCount` is a denormalized counter maintained by completion toggles.
  courseEnrollments: defineTable({
    churchId: v.id("churches"),
    courseId: v.id("courses"),
    personId: v.optional(v.id("people")),
    groupId: v.optional(v.id("groups")),
    status: enrollmentStatus,
    progressPercent: v.number(),
    completedCount: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_church", ["churchId"])
    .index("by_course", ["courseId"])
    .index("by_course_and_group", ["courseId", "groupId"])
    .index("by_person", ["personId"])
    .index("by_course_and_person", ["courseId", "personId"]),

  // ── Lesson Completions ────────────────────────────────────────────────
  // Extracted from the old `courseEnrollments.completedLessons` array.
  // Each row represents one person completing one lesson.
  lessonCompletions: defineTable({
    churchId: v.id("churches"),
    enrollmentId: v.id("courseEnrollments"),
    lessonId: v.id("lessons"),
    completedAt: v.number(),
  })
    .index("by_enrollment", ["enrollmentId"])
    .index("by_lesson", ["lessonId"])
    .index("by_enrollment_and_lesson", ["enrollmentId", "lessonId"])
    .index("by_church", ["churchId"]),

  // ── Events ────────────────────────────────────────────────────────────
  events: defineTable({
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    summary: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    location: v.string(),
    registrationUrl: v.optional(v.string()),
    featured: v.boolean(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_church_and_start_date", ["churchId", "startDate"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["churchId", "status"],
    }),

  // ── Sermons ───────────────────────────────────────────────────────────
  sermons: defineTable({
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    speaker: v.string(),
    series: v.optional(v.string()),
    summary: v.string(),
    videoUrl: v.optional(v.string()),
    preachedAt: v.number(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_church_and_preached_at", ["churchId", "preachedAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["churchId", "status"],
    }),

  // ── Facilities ────────────────────────────────────────────────────────
  facilities: defineTable({
    churchId: v.id("churches"),
    name: v.string(),
    roomType: roomType,
    capacity: v.number(),
    availability: roomAvailability,
    notes: v.optional(v.string()),
  }).index("by_church", ["churchId"]),

  // ── Contributions ─────────────────────────────────────────────────────
  contributions: defineTable({
    churchId: v.id("churches"),
    personId: v.optional(v.id("people")),
    donorName: v.string(),
    amount: v.number(),
    fund: fundType,
    paymentMethod: paymentMethod,
    status: paymentStatus,
    recurring: v.boolean(),
    donatedAt: v.number(),
  })
    .index("by_church", ["churchId"])
    .index("by_person", ["personId"])
    .index("by_church_and_date", ["churchId", "donatedAt"]),

  // ── Landing Pages ─────────────────────────────────────────────────────
  landingPages: defineTable({
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    pageType: pageType,
    ministryId: v.optional(v.id("ministries")),
    groupId: v.optional(v.id("groups")),
    courseId: v.optional(v.id("courses")),
    themeMode: themeMode,
    themeOverrides: v.optional(
      v.object({
        accent: v.optional(v.string()),
        surface: v.optional(v.string()),
        ink: v.optional(v.string()),
        heroTone: v.optional(heroTone),
      })
    ),
    seoDescription: v.optional(v.string()),
    blocks: v.array(landingPageBlock),
  })
    .index("by_church", ["churchId"])
    .index("by_church_and_slug", ["churchId", "slug"])
    .index("by_church_and_ministry", ["churchId", "ministryId"])
    .index("by_church_and_group", ["churchId", "groupId"])
    .index("by_church_and_course", ["churchId", "courseId"]),
});
