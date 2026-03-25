import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { requireChurchScopedDocument } from "./lib/records";
import { enrollmentStatus } from "./lib/validators";

/**
 * List all enrollments for a given course.
 * Requires access to the course's church.
 */
export const listByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    if (!course) return [];

    await requireChurchAccess(ctx, course.churchId);

    return await ctx.db
      .query("courseEnrollments")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .take(200);
  },
});

/**
 * List all course enrollments for a given person.
 * Requires access to the person's church.
 */
export const listByPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return [];

    await requireChurchAccess(ctx, person.churchId);

    return await ctx.db
      .query("courseEnrollments")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .take(200);
  },
});

/**
 * Enroll a person (or group) in a course.
 * Initializes with completedCount: 0 and progressPercent: 0.
 * Requires access to the course's church.
 */
export const enroll = mutation({
  args: {
    churchId: v.id("churches"),
    courseId: v.id("courses"),
    personId: v.optional(v.id("people")),
    groupId: v.optional(v.id("groups")),
    status: enrollmentStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);
    if (!args.personId && !args.groupId) {
      throw new Error(
        "Course enrollments require either a personId or a groupId"
      );
    }
    if (args.personId && args.groupId) {
      throw new Error(
        "Course enrollments must target either a person or a group"
      );
    }

    await requireChurchScopedDocument(
      ctx,
      args.courseId,
      args.churchId,
      "Course"
    );
    if (args.personId) {
      await requireChurchScopedDocument(
        ctx,
        args.personId,
        args.churchId,
        "Person"
      );
    }
    if (args.groupId) {
      await requireChurchScopedDocument(
        ctx,
        args.groupId,
        args.churchId,
        "Group"
      );
    }

    // If enrolling a person, check for existing enrollment
    if (args.personId) {
      const existing = await ctx.db
        .query("courseEnrollments")
        .withIndex("by_course_and_person", (q) =>
          q.eq("courseId", args.courseId).eq("personId", args.personId!)
        )
        .unique();
      if (existing) {
        throw new Error("This person is already enrolled in this course");
      }
    }

    if (args.groupId) {
      const existing = await ctx.db
        .query("courseEnrollments")
        .withIndex("by_course_and_group", (q) =>
          q.eq("courseId", args.courseId).eq("groupId", args.groupId)
        )
        .unique();
      if (existing) {
        throw new Error("This group is already enrolled in this course");
      }
    }

    return await ctx.db.insert("courseEnrollments", {
      churchId: args.churchId,
      courseId: args.courseId,
      personId: args.personId,
      groupId: args.groupId,
      status: args.status,
      progressPercent: 0,
      completedCount: 0,
      startedAt: Date.now(),
      notes: args.notes,
    });
  },
});

/**
 * Remove an enrollment and all related lesson completions.
 * Requires access to the enrollment's church.
 */
export const remove = mutation({
  args: { enrollmentId: v.id("courseEnrollments") },
  handler: async (ctx, { enrollmentId }) => {
    const enrollment = await ctx.db.get(enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");

    await requireChurchAccess(ctx, enrollment.churchId);

    // Delete all related lesson completions
    const completions = await ctx.db
      .query("lessonCompletions")
      .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
      .take(200);

    for (const completion of completions) {
      await ctx.db.delete(completion._id);
    }

    // Delete the enrollment itself
    await ctx.db.delete(enrollmentId);

    return enrollmentId;
  },
});
