import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

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
      .collect();
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
      .collect();
  },
});

/**
 * Enroll a person (or group) in a course.
 * Requires access to the course's church.
 */
export const enroll = mutation({
  args: {
    churchId: v.id("churches"),
    courseId: v.id("courses"),
    personId: v.optional(v.id("people")),
    groupId: v.optional(v.id("groups")),
    status: v.union(
      v.literal("invited"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

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

    return await ctx.db.insert("courseEnrollments", {
      churchId: args.churchId,
      courseId: args.courseId,
      personId: args.personId,
      groupId: args.groupId,
      status: args.status,
      progressPercent: 0,
      startedAt: Date.now(),
      completedLessons: [],
      notes: args.notes,
    });
  },
});

/**
 * Toggle a lesson's completion status for an enrollment.
 * If the lesson is already marked complete it will be removed;
 * otherwise it will be added.
 * Requires access to the enrollment's church.
 */
export const toggleLessonCompletion = mutation({
  args: {
    enrollmentId: v.id("courseEnrollments"),
    lessonId: v.string(),
    lessonTitle: v.string(),
  },
  handler: async (ctx, { enrollmentId, lessonId, lessonTitle }) => {
    const enrollment = await ctx.db.get(enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");

    await requireChurchAccess(ctx, enrollment.churchId);

    const completedLessons = [...enrollment.completedLessons];
    const existingIndex = completedLessons.findIndex(
      (l) => l.lessonId === lessonId
    );

    if (existingIndex >= 0) {
      // Remove the lesson (un-complete it)
      completedLessons.splice(existingIndex, 1);
    } else {
      // Mark the lesson as completed
      completedLessons.push({
        lessonId,
        title: lessonTitle,
        completedAt: Date.now(),
      });
    }

    // Recalculate progress based on the parent course's lesson count
    const course = await ctx.db.get(enrollment.courseId);
    const totalLessons = course?.lessons.length ?? 1;
    const progressPercent = Math.round(
      (completedLessons.length / totalLessons) * 100
    );

    const isComplete = progressPercent >= 100;

    await ctx.db.patch(enrollmentId, {
      completedLessons,
      progressPercent,
      status: isComplete ? "completed" : enrollment.status,
      completedAt: isComplete ? Date.now() : enrollment.completedAt,
    });

    return enrollmentId;
  },
});
