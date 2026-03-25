import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess } from "./lib/auth";
import { requireChurchScopedDocument } from "./lib/records";
import { publishStatus, courseType, deliveryMode } from "./lib/validators";

/**
 * List courses for a church.
 * Public callers see only published courses. Authenticated users with
 * church access see all statuses.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    if (await hasChurchAccess(ctx, churchId)) {
      return await ctx.db
        .query("courses")
        .withIndex("by_church", (q) => q.eq("churchId", churchId))
        .take(200);
    }

    return await ctx.db
      .query("courses")
      .withIndex("by_church_and_status", (q) =>
        q.eq("churchId", churchId).eq("status", "published")
      )
      .take(200);
  },
});

/**
 * Get a course by church ID and slug.
 * Public for published courses.
 */
export const getBySlug = query({
  args: { churchId: v.id("churches"), slug: v.string() },
  handler: async (ctx, { churchId, slug }) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!course) return null;

    if (course.status === "published") return course;

    if (await hasChurchAccess(ctx, churchId)) {
      return course;
    }

    return null;
  },
});

/**
 * Create a new course.
 * Lessons are managed separately via the lessons module.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);
    if (args.ministryId) {
      await requireChurchScopedDocument(
        ctx,
        args.ministryId,
        args.churchId,
        "Ministry"
      );
    }

    const existing = await ctx.db
      .query("courses")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `A course with slug "${args.slug}" already exists in this church`
      );
    }

    return await ctx.db.insert("courses", {
      ...args,
      lessonCount: 0,
    });
  },
});

/**
 * Update an existing course.
 * Does not touch lessonCount — that is managed by lesson mutations.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    courseId: v.id("courses"),
    ministryId: v.optional(v.id("ministries")),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(publishStatus),
    courseType: v.optional(courseType),
    deliveryMode: v.optional(deliveryMode),
    audience: v.optional(v.string()),
    duration: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    certificateOffered: v.optional(v.boolean()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { courseId, ...fields }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    await requireChurchAccess(ctx, course.churchId);
    if (fields.ministryId) {
      await requireChurchScopedDocument(
        ctx,
        fields.ministryId,
        course.churchId,
        "Ministry"
      );
    }

    if (fields.slug && fields.slug !== course.slug) {
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", course.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `A course with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(courseId, patch);
    return courseId;
  },
});

/**
 * Archive a course.
 * Requires church-level access.
 */
export const archive = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    await requireChurchAccess(ctx, course.churchId);

    await ctx.db.patch(courseId, { status: "archived" });
    return courseId;
  },
});
