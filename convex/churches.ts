import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess, requireRole } from "./lib/auth";
import { publishStatus, churchTheme, dayOfWeek } from "./lib/validators";

/**
 * List all published churches.
 * Public — no authentication required.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("churches")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .take(200);
  },
});

/**
 * Get a church by its URL slug.
 * Public — returns `null` when the church does not exist or is not published.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const church = await ctx.db
      .query("churches")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!church || church.status !== "published") return null;
    return church;
  },
});

/**
 * Get a published church by document ID.
 * Public — returns `null` for missing or unpublished churches.
 */
export const getPublishedById = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    const church = await ctx.db.get(churchId);
    if (!church || church.status !== "published") return null;
    return church;
  },
});

/**
 * Get a church by its document ID.
 * Requires authentication and church-level access.
 */
export const getById = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    await requireChurchAccess(ctx, churchId);
    return await ctx.db.get(churchId);
  },
});

/**
 * Create a new church.
 * Requires super-admin or church-admin role.
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    status: publishStatus,
    tagline: v.string(),
    summary: v.string(),
    heroImage: v.optional(v.id("media")),
    serviceTimes: v.array(
      v.object({ label: v.string(), day: dayOfWeek, time: v.string() })
    ),
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
    theme: churchTheme,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["church-admin"]);

    // Ensure slug uniqueness
    const existing = await ctx.db
      .query("churches")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error(`A church with slug "${args.slug}" already exists`);
    }

    return await ctx.db.insert("churches", args);
  },
});

/**
 * Update an existing church.
 * Requires access to the target church.
 */
export const update = mutation({
  args: {
    churchId: v.id("churches"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(publishStatus),
    tagline: v.optional(v.string()),
    summary: v.optional(v.string()),
    heroImage: v.optional(v.id("media")),
    serviceTimes: v.optional(
      v.array(
        v.object({ label: v.string(), day: dayOfWeek, time: v.string() })
      )
    ),
    address: v.optional(
      v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        postalCode: v.string(),
      })
    ),
    contact: v.optional(
      v.object({
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        website: v.optional(v.string()),
      })
    ),
    givingUrl: v.optional(v.string()),
    livestreamUrl: v.optional(v.string()),
    theme: v.optional(churchTheme),
  },
  handler: async (ctx, { churchId, ...fields }) => {
    await requireChurchAccess(ctx, churchId);

    const church = await ctx.db.get(churchId);
    if (!church) throw new Error("Church not found");

    // If slug is changing, check uniqueness
    if (fields.slug && fields.slug !== church.slug) {
      const existing = await ctx.db
        .query("churches")
        .withIndex("by_slug", (q) => q.eq("slug", fields.slug!))
        .unique();
      if (existing) {
        throw new Error(`A church with slug "${fields.slug}" already exists`);
      }
    }

    // Build a patch from only the supplied fields
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(churchId, patch);
    return churchId;
  },
});

/**
 * Archive a church.
 * Requires access to the target church.
 */
export const archive = mutation({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    await requireChurchAccess(ctx, churchId);

    const church = await ctx.db.get(churchId);
    if (!church) throw new Error("Church not found");

    await ctx.db.patch(churchId, { status: "archived" });
    return churchId;
  },
});
