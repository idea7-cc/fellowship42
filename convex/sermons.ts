import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess } from "./lib/auth";
import { publishStatus } from "./lib/validators";

/**
 * List recent sermons for a church, ordered by preached date descending.
 * Public callers see only published sermons.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    if (await hasChurchAccess(ctx, churchId)) {
      return await ctx.db
        .query("sermons")
        .withIndex("by_church_and_preached_at", (q) =>
          q.eq("churchId", churchId)
        )
        .order("desc")
        .take(200);
    }

    const allPublished = await ctx.db
      .query("sermons")
      .withIndex("by_church_and_preached_at", (q) =>
        q.eq("churchId", churchId)
      )
      .order("desc")
      .take(200);

    return allPublished.filter((s) => s.status === "published");
  },
});

/**
 * Get a sermon by church ID and slug.
 * Public for published sermons.
 */
export const getBySlug = query({
  args: { churchId: v.id("churches"), slug: v.string() },
  handler: async (ctx, { churchId, slug }) => {
    const sermon = await ctx.db
      .query("sermons")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!sermon) return null;

    if (sermon.status === "published") return sermon;

    if (await hasChurchAccess(ctx, churchId)) {
      return sermon;
    }

    return null;
  },
});

/**
 * Create a new sermon.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    speaker: v.string(),
    series: v.optional(v.string()),
    summary: v.string(),
    videoUrl: v.optional(v.string()),
    preachedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const existing = await ctx.db
      .query("sermons")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `A sermon with slug "${args.slug}" already exists in this church`
      );
    }

    return await ctx.db.insert("sermons", args);
  },
});

/**
 * Update an existing sermon.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    sermonId: v.id("sermons"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(publishStatus),
    speaker: v.optional(v.string()),
    series: v.optional(v.string()),
    summary: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    preachedAt: v.optional(v.number()),
  },
  handler: async (ctx, { sermonId, ...fields }) => {
    const sermon = await ctx.db.get(sermonId);
    if (!sermon) throw new Error("Sermon not found");

    await requireChurchAccess(ctx, sermon.churchId);

    if (fields.slug && fields.slug !== sermon.slug) {
      const existing = await ctx.db
        .query("sermons")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", sermon.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `A sermon with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(sermonId, patch);
    return sermonId;
  },
});

/**
 * Archive a sermon.
 * Requires church-level access.
 */
export const archive = mutation({
  args: { sermonId: v.id("sermons") },
  handler: async (ctx, { sermonId }) => {
    const sermon = await ctx.db.get(sermonId);
    if (!sermon) throw new Error("Sermon not found");

    await requireChurchAccess(ctx, sermon.churchId);

    await ctx.db.patch(sermonId, { status: "archived" });
    return sermonId;
  },
});
