import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess } from "./lib/auth";
import { requireDocument, requireChurchScopedDocument } from "./lib/records";

/**
 * List lessons for a course, ordered by sortOrder.
 * Public for published courses, requires church access for drafts.
 */
export const listByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    if (!course) return [];

    // Published courses: lessons are public
    if (course.status === "published") {
      return await ctx.db
        .query("lessons")
        .withIndex("by_course_and_order", (q) => q.eq("courseId", courseId))
        .take(200);
    }

    // Draft/archived courses require church access
    await requireChurchAccess(ctx, course.churchId);

    return await ctx.db
      .query("lessons")
      .withIndex("by_course_and_order", (q) => q.eq("courseId", courseId))
      .take(200);
  },
});

/**
 * Get a single lesson by ID.
 * Requires church access to the lesson's church.
 */
export const getById = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;

    await requireChurchAccess(ctx, lesson.churchId);
    return lesson;
  },
});

/**
 * Create a new lesson within a course.
 * Sets sortOrder to current lesson count and increments courses.lessonCount.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    courseId: v.id("courses"),
    title: v.string(),
    summary: v.string(),
    content: v.optional(v.string()),
    resourceId: v.optional(v.id("media")),
    estimatedMinutes: v.optional(v.number()),
    required: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const course = await requireChurchScopedDocument(
      ctx,
      args.courseId,
      args.churchId,
      "Course"
    );

    // New lesson goes at the end
    const sortOrder = course.lessonCount;

    const lessonId = await ctx.db.insert("lessons", {
      ...args,
      sortOrder,
    });

    // Increment the denormalized counter on the course
    await ctx.db.patch(args.courseId, {
      lessonCount: course.lessonCount + 1,
    });

    return lessonId;
  },
});

/**
 * Update an existing lesson.
 * Requires church-level access. Partial patch.
 */
export const update = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    content: v.optional(v.string()),
    resourceId: v.optional(v.id("media")),
    estimatedMinutes: v.optional(v.number()),
    required: v.optional(v.boolean()),
  },
  handler: async (ctx, { lessonId, ...fields }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");

    await requireChurchAccess(ctx, lesson.churchId);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(lessonId, patch);
    return lessonId;
  },
});

/**
 * Remove a lesson.
 * Deletes the lesson, decrements courses.lessonCount, and
 * deletes any related lessonCompletions.
 * Requires church-level access.
 */
export const remove = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");

    await requireChurchAccess(ctx, lesson.churchId);

    const course = await requireDocument(ctx, lesson.courseId, "Course");

    // Delete all related lesson completions
    const completions = await ctx.db
      .query("lessonCompletions")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .take(200);

    for (const completion of completions) {
      await ctx.db.delete(completion._id);
    }

    // Delete the lesson itself
    await ctx.db.delete(lessonId);

    // Decrement the denormalized counter on the course
    await ctx.db.patch(lesson.courseId, {
      lessonCount: Math.max(0, course.lessonCount - 1),
    });

    return lessonId;
  },
});

/**
 * Reorder lessons within a course.
 * Accepts an array of lesson IDs in the desired order and batch-updates sortOrder.
 * Requires church-level access.
 */
export const reorder = mutation({
  args: {
    courseId: v.id("courses"),
    lessonIds: v.array(v.id("lessons")),
  },
  handler: async (ctx, { courseId, lessonIds }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    await requireChurchAccess(ctx, course.churchId);

    // Update sortOrder for each lesson
    for (let i = 0; i < lessonIds.length; i++) {
      const lesson = await ctx.db.get(lessonIds[i]);
      if (!lesson) throw new Error(`Lesson not found: ${lessonIds[i]}`);
      if (lesson.courseId !== courseId) {
        throw new Error("Lesson does not belong to this course");
      }

      await ctx.db.patch(lessonIds[i], { sortOrder: i });
    }

    return courseId;
  },
});
