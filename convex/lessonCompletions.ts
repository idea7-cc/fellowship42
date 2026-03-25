import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { requireDocument } from "./lib/records";

/**
 * List all completions for an enrollment.
 * Requires church access.
 */
export const listByEnrollment = query({
  args: { enrollmentId: v.id("courseEnrollments") },
  handler: async (ctx, { enrollmentId }) => {
    const enrollment = await ctx.db.get(enrollmentId);
    if (!enrollment) return [];

    await requireChurchAccess(ctx, enrollment.churchId);

    return await ctx.db
      .query("lessonCompletions")
      .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
      .take(200);
  },
});

/**
 * Toggle a lesson's completion status for an enrollment.
 * If a completion exists, delete it and decrement completedCount.
 * If not, create it and increment completedCount.
 * Recalculates progressPercent and updates enrollment status to
 * "completed" if 100%.
 * Requires church access.
 */
export const toggle = mutation({
  args: {
    enrollmentId: v.id("courseEnrollments"),
    lessonId: v.id("lessons"),
  },
  handler: async (ctx, { enrollmentId, lessonId }) => {
    const enrollment = await ctx.db.get(enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");

    await requireChurchAccess(ctx, enrollment.churchId);

    // Verify the lesson exists and belongs to the enrolled course
    const lesson = await requireDocument(ctx, lessonId, "Lesson");
    if (lesson.courseId !== enrollment.courseId) {
      throw new Error("Lesson does not belong to the enrolled course");
    }

    const course = await requireDocument(ctx, enrollment.courseId, "Course");

    // Check if completion already exists
    const existing = await ctx.db
      .query("lessonCompletions")
      .withIndex("by_enrollment_and_lesson", (q) =>
        q.eq("enrollmentId", enrollmentId).eq("lessonId", lessonId)
      )
      .unique();

    let newCompletedCount: number;

    if (existing) {
      // Un-complete: delete the completion, decrement
      await ctx.db.delete(existing._id);
      newCompletedCount = Math.max(0, enrollment.completedCount - 1);
    } else {
      // Complete: create a completion, increment
      await ctx.db.insert("lessonCompletions", {
        churchId: enrollment.churchId,
        enrollmentId,
        lessonId,
        completedAt: Date.now(),
      });
      newCompletedCount = enrollment.completedCount + 1;
    }

    // Recalculate progress
    const totalLessons = course.lessonCount || 1;
    const progressPercent = Math.round(
      (newCompletedCount / totalLessons) * 100
    );
    const isComplete = progressPercent >= 100;

    const nextStatus =
      enrollment.status === "archived"
        ? "archived"
        : isComplete
          ? "completed"
          : "active";

    await ctx.db.patch(enrollmentId, {
      completedCount: newCompletedCount,
      progressPercent,
      status: nextStatus,
      completedAt: isComplete ? Date.now() : undefined,
    });

    return enrollmentId;
  },
});
