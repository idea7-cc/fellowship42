import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
    // ── Churches ──────────────────────────────────────────────────────────
    churches: defineTable({
        name: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
        tagline: v.string(),
        summary: v.string(),
        heroImage: v.optional(v.id("media")),
        serviceTimes: v.array(v.object({
            label: v.string(),
            day: v.string(),
            time: v.string(),
        })),
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
        theme: v.object({
            preset: v.string(),
            accent: v.string(),
            surface: v.string(),
            ink: v.string(),
            heroTone: v.string(),
            radius: v.string(),
            headingFont: v.string(),
            bodyFont: v.string(),
        }),
    })
        .index("by_slug", ["slug"])
        .index("by_status", ["status"]),
    // ── Users ─────────────────────────────────────────────────────────────
    users: defineTable({
        firstName: v.string(),
        lastName: v.string(),
        email: v.string(),
        roles: v.array(v.union(v.literal("super-admin"), v.literal("church-admin"), v.literal("finance"), v.literal("ministry-leader"), v.literal("member"))),
        churchIds: v.array(v.id("churches")),
        personId: v.optional(v.id("people")),
        clerkId: v.optional(v.string()),
    })
        .index("by_email", ["email"])
        .index("by_clerk_id", ["clerkId"]),
    // ── People ────────────────────────────────────────────────────────────
    people: defineTable({
        churchId: v.id("churches"),
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        householdName: v.optional(v.string()),
        membershipStatus: v.union(v.literal("guest"), v.literal("regular-attender"), v.literal("member"), v.literal("volunteer")),
        volunteerReady: v.boolean(),
        notes: v.optional(v.string()),
    })
        .index("by_church", ["churchId"])
        .index("by_church_and_email", ["churchId", "email"]),
    // ── Media ─────────────────────────────────────────────────────────────
    media: defineTable({
        churchId: v.optional(v.id("churches")),
        resourceType: v.union(v.literal("image"), v.literal("worksheet"), v.literal("lesson-guide"), v.literal("video"), v.literal("handbook")),
        alt: v.string(),
        storageId: v.string(),
        url: v.optional(v.string()),
    }).index("by_church", ["churchId"]),
    // ── Ministries ────────────────────────────────────────────────────────
    ministries: defineTable({
        churchId: v.id("churches"),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
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
        status: v.union(v.literal("draft"), v.literal("published")),
        groupType: v.union(v.literal("small-group"), v.literal("sunday-school"), v.literal("bible-study"), v.literal("support-group"), v.literal("serving-team"), v.literal("training-cohort")),
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
        .index("by_church_and_status", ["churchId", "status"]),
    // ── Group Memberships ─────────────────────────────────────────────────
    groupMemberships: defineTable({
        churchId: v.id("churches"),
        groupId: v.id("groups"),
        personId: v.id("people"),
        role: v.union(v.literal("member"), v.literal("leader"), v.literal("apprentice"), v.literal("host")),
        status: v.union(v.literal("interested"), v.literal("pending"), v.literal("active"), v.literal("paused"), v.literal("completed")),
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
        attendanceStatus: v.union(v.literal("planned"), v.literal("submitted")),
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
        status: v.union(v.literal("present"), v.literal("absent"), v.literal("excused"), v.literal("serving")),
        checkedInAt: v.optional(v.number()),
        notes: v.optional(v.string()),
    })
        .index("by_church", ["churchId"])
        .index("by_session", ["sessionId"])
        .index("by_person", ["personId"]),
    // ── Courses ───────────────────────────────────────────────────────────
    courses: defineTable({
        churchId: v.id("churches"),
        ministryId: v.optional(v.id("ministries")),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
        courseType: v.union(v.literal("new-member"), v.literal("volunteer-training"), v.literal("discipleship"), v.literal("leadership"), v.literal("bible-study"), v.literal("curriculum")),
        deliveryMode: v.union(v.literal("self-paced"), v.literal("group-led"), v.literal("cohort"), v.literal("hybrid")),
        audience: v.string(),
        duration: v.string(),
        featured: v.boolean(),
        certificateOffered: v.boolean(),
        summary: v.string(),
        lessons: v.array(v.object({
            lessonId: v.string(),
            title: v.string(),
            summary: v.string(),
            content: v.optional(v.string()),
            resourceId: v.optional(v.string()),
            estimatedMinutes: v.optional(v.number()),
            required: v.optional(v.boolean()),
        })),
    })
        .index("by_church", ["churchId"])
        .index("by_church_and_slug", ["churchId", "slug"])
        .index("by_ministry", ["ministryId"])
        .index("by_church_and_status", ["churchId", "status"]),
    // ── Course Enrollments ────────────────────────────────────────────────
    courseEnrollments: defineTable({
        churchId: v.id("churches"),
        courseId: v.id("courses"),
        personId: v.optional(v.id("people")),
        groupId: v.optional(v.id("groups")),
        status: v.union(v.literal("invited"), v.literal("active"), v.literal("completed"), v.literal("archived")),
        progressPercent: v.number(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        completedLessons: v.array(v.object({
            lessonId: v.string(),
            title: v.string(),
            completedAt: v.number(),
        })),
        notes: v.optional(v.string()),
    })
        .index("by_church", ["churchId"])
        .index("by_course", ["courseId"])
        .index("by_course_and_group", ["courseId", "groupId"])
        .index("by_person", ["personId"])
        .index("by_course_and_person", ["courseId", "personId"]),
    // ── Events ────────────────────────────────────────────────────────────
    events: defineTable({
        churchId: v.id("churches"),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
        summary: v.string(),
        startDate: v.number(),
        endDate: v.optional(v.number()),
        location: v.string(),
        registrationUrl: v.optional(v.string()),
        featured: v.boolean(),
    })
        .index("by_church", ["churchId"])
        .index("by_church_and_slug", ["churchId", "slug"])
        .index("by_church_and_start_date", ["churchId", "startDate"]),
    // ── Sermons ───────────────────────────────────────────────────────────
    sermons: defineTable({
        churchId: v.id("churches"),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
        speaker: v.string(),
        series: v.optional(v.string()),
        summary: v.string(),
        videoUrl: v.optional(v.string()),
        preachedAt: v.number(),
    })
        .index("by_church", ["churchId"])
        .index("by_church_and_slug", ["churchId", "slug"])
        .index("by_church_and_preached_at", ["churchId", "preachedAt"]),
    // ── Facilities ────────────────────────────────────────────────────────
    facilities: defineTable({
        churchId: v.id("churches"),
        name: v.string(),
        roomType: v.union(v.literal("sanctuary"), v.literal("classroom"), v.literal("lobby"), v.literal("office"), v.literal("multipurpose")),
        capacity: v.number(),
        availability: v.union(v.literal("available"), v.literal("reserved"), v.literal("maintenance")),
        notes: v.optional(v.string()),
    }).index("by_church", ["churchId"]),
    // ── Contributions ─────────────────────────────────────────────────────
    contributions: defineTable({
        churchId: v.id("churches"),
        personId: v.optional(v.id("people")),
        donorName: v.string(),
        amount: v.number(),
        fund: v.union(v.literal("general"), v.literal("missions"), v.literal("benevolence"), v.literal("building")),
        paymentMethod: v.union(v.literal("card"), v.literal("ach"), v.literal("cash"), v.literal("check")),
        status: v.union(v.literal("pending"), v.literal("succeeded"), v.literal("refunded")),
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
        status: v.union(v.literal("draft"), v.literal("published")),
        pageType: v.union(v.literal("ministry"), v.literal("group"), v.literal("course")),
        ministryId: v.optional(v.id("ministries")),
        groupId: v.optional(v.id("groups")),
        courseId: v.optional(v.id("courses")),
        themeMode: v.union(v.literal("inherit"), v.literal("custom")),
        themeOverrides: v.optional(v.object({
            accent: v.optional(v.string()),
            surface: v.optional(v.string()),
            ink: v.optional(v.string()),
            heroTone: v.optional(v.string()),
        })),
        seoDescription: v.optional(v.string()),
        blocks: v.array(v.any()),
    })
        .index("by_church", ["churchId"])
        .index("by_church_and_slug", ["churchId", "slug"])
        .index("by_church_and_ministry", ["churchId", "ministryId"])
        .index("by_church_and_group", ["churchId", "groupId"])
        .index("by_church_and_course", ["churchId", "courseId"]),
});
