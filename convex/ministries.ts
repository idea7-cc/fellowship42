import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

/**
 * List ministries for a church.
 * Public callers see only published ministries. Authenticated users with
 * church access see all (draft + published).
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      // Attempt church-access check; fall back to public view on failure
      try {
        await requireChurchAccess(ctx, churchId);
        return await ctx.db
          .query("ministries")
          .withIndex("by_church", (q) => q.eq("churchId", churchId))
          .collect();
      } catch {
        // User is authenticated but lacks access — return published only
      }
    }

    return await ctx.db
      .query("ministries")
      .withIndex("by_church_and_status", (q) =>
        q.eq("churchId", churchId).eq("status", "published")
      )
      .collect();
  },
});

/**
 * Get a ministry by church ID and slug.
 * Public for published ministries.
 */
export const getBySlug = query({
  args: { churchId: v.id("churches"), slug: v.string() },
  handler: async (ctx, { churchId, slug }) => {
    const ministry = await ctx.db
      .query("ministries")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!ministry) return null;

    // Allow published ministries for everyone
    if (ministry.status === "published") return ministry;

    // Draft ministries require church access
    try {
      await requireChurchAccess(ctx, churchId);
      return ministry;
    } catch {
      return null;
    }
  },
});

/**
 * Create a new ministry.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    audience: v.string(),
    schedule: v.string(),
    featured: v.boolean(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    // Ensure slug uniqueness within the church
    const existing = await ctx.db
      .query("ministries")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `A ministry with slug "${args.slug}" already exists in this church`
      );
    }

    return await ctx.db.insert("ministries", args);
  },
});

/**
 * Update an existing ministry.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    ministryId: v.id("ministries"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    audience: v.optional(v.string()),
    schedule: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { ministryId, ...fields }) => {
    const ministry = await ctx.db.get(ministryId);
    if (!ministry) throw new Error("Ministry not found");

    await requireChurchAccess(ctx, ministry.churchId);

    // If slug is changing, check uniqueness
    if (fields.slug && fields.slug !== ministry.slug) {
      const existing = await ctx.db
        .query("ministries")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", ministry.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `A ministry with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(ministryId, patch);
    return ministryId;
  },
});
