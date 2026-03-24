import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

/**
 * List groups for a church.
 * Public callers see only published groups. Authenticated users with
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
          .query("groups")
          .withIndex("by_church", (q) => q.eq("churchId", churchId))
          .collect();
      } catch {
        // Fall through to public view
      }
    }

    return await ctx.db
      .query("groups")
      .withIndex("by_church_and_status", (q) =>
        q.eq("churchId", churchId).eq("status", "published")
      )
      .collect();
  },
});

/**
 * List groups that belong to a specific ministry.
 * Public callers see only published groups.
 */
export const listByMinistry = query({
  args: { ministryId: v.id("ministries") },
  handler: async (ctx, { ministryId }) => {
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_ministry", (q) => q.eq("ministryId", ministryId))
      .collect();

    const identity = await ctx.auth.getUserIdentity();

    if (identity && groups.length > 0) {
      try {
        await requireChurchAccess(ctx, groups[0].churchId);
        return groups;
      } catch {
        // Fall through to published filter
      }
    }

    return groups.filter((g) => g.status === "published");
  },
});

/**
 * Get a group by church ID and slug.
 * Public for published groups.
 */
export const getBySlug = query({
  args: { churchId: v.id("churches"), slug: v.string() },
  handler: async (ctx, { churchId, slug }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!group) return null;

    if (group.status === "published") return group;

    try {
      await requireChurchAccess(ctx, churchId);
      return group;
    } catch {
      return null;
    }
  },
});

/**
 * Create a new group.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    ministryId: v.optional(v.id("ministries")),
    title: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    groupType: v.union(
      v.literal("small-group"),
      v.literal("sunday-school"),
      v.literal("bible-study"),
      v.literal("support-group"),
      v.literal("serving-team"),
      v.literal("training-cohort")
    ),
    audience: v.string(),
    schedule: v.string(),
    location: v.optional(v.string()),
    openEnrollment: v.boolean(),
    featured: v.boolean(),
    capacity: v.optional(v.number()),
    leaderIds: v.array(v.id("people")),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const existing = await ctx.db
      .query("groups")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `A group with slug "${args.slug}" already exists in this church`
      );
    }

    return await ctx.db.insert("groups", args);
  },
});

/**
 * Update an existing group.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    groupId: v.id("groups"),
    ministryId: v.optional(v.id("ministries")),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    groupType: v.optional(
      v.union(
        v.literal("small-group"),
        v.literal("sunday-school"),
        v.literal("bible-study"),
        v.literal("support-group"),
        v.literal("serving-team"),
        v.literal("training-cohort")
      )
    ),
    audience: v.optional(v.string()),
    schedule: v.optional(v.string()),
    location: v.optional(v.string()),
    openEnrollment: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    capacity: v.optional(v.number()),
    leaderIds: v.optional(v.array(v.id("people"))),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { groupId, ...fields }) => {
    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");

    await requireChurchAccess(ctx, group.churchId);

    if (fields.slug && fields.slug !== group.slug) {
      const existing = await ctx.db
        .query("groups")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", group.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `A group with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(groupId, patch);
    return groupId;
  },
});
