import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

/**
 * List courses for a church.
 * Public callers see only published courses. Authenticated users with
 * church access see all statuses.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      try {
        await requireChurchAccess(ctx, churchId);
        return await ctx.db
          .query("courses")
          .withIndex("by_church", (q) => q.eq("churchId", churchId))
          .collect();
      } catch {
        // Fall through to public view
      }
    }

    return await ctx.db
      .query("courses")
      .withIndex("by_church_and_status", (q) =>
        q.eq("churchId", churchId).eq("status", "published")
      )
      .collect();
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

    try {
      await requireChurchAccess(ctx, churchId);
      return course;
    } catch {
      return null;
    }
  },
});

/**
 * Create a new course.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    ministryId: v.optional(v.id("ministries")),
    title: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    courseType: v.union(
      v.literal("new-member"),
      v.literal("volunteer-training"),
      v.literal("discipleship"),
      v.literal("leadership"),
      v.literal("bible-study"),
      v.literal("curriculum")
    ),
    deliveryMode: v.union(
      v.literal("self-paced"),
      v.literal("group-led"),
      v.literal("cohort"),
      v.literal("hybrid")
    ),
    audience: v.string(),
    duration: v.string(),
    featured: v.boolean(),
    certificateOffered: v.boolean(),
    summary: v.string(),
    lessons: v.array(
      v.object({
        title: v.string(),
        summary: v.string(),
        content: v.optional(v.string()),
        resourceId: v.optional(v.string()),
        estimatedMinutes: v.optional(v.number()),
        required: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

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

    return await ctx.db.insert("courses", args);
  },
});

/**
 * Update an existing course.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    courseId: v.id("courses"),
    ministryId: v.optional(v.id("ministries")),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    courseType: v.optional(
      v.union(
        v.literal("new-member"),
        v.literal("volunteer-training"),
        v.literal("discipleship"),
        v.literal("leadership"),
        v.literal("bible-study"),
        v.literal("curriculum")
      )
    ),
    deliveryMode: v.optional(
      v.union(
        v.literal("self-paced"),
        v.literal("group-led"),
        v.literal("cohort"),
        v.literal("hybrid")
      )
    ),
    audience: v.optional(v.string()),
    duration: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    certificateOffered: v.optional(v.boolean()),
    summary: v.optional(v.string()),
    lessons: v.optional(
      v.array(
        v.object({
          title: v.string(),
          summary: v.string(),
          content: v.optional(v.string()),
          resourceId: v.optional(v.string()),
          estimatedMinutes: v.optional(v.number()),
          required: v.optional(v.boolean()),
        })
      )
    ),
  },
  handler: async (ctx, { courseId, ...fields }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    await requireChurchAccess(ctx, course.churchId);

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
