import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess } from "./lib/auth";
import { publishStatus } from "./lib/validators";

/**
 * List upcoming events for a church, ordered by start date.
 * Public callers see only published events. Authenticated users with
 * church access see all statuses.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    const now = Date.now();

    if (await hasChurchAccess(ctx, churchId)) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_church_and_start_date", (q) =>
          q.eq("churchId", churchId)
        )
        .order("asc")
        .take(200);

      return events.filter((event) => event.startDate >= now);
    }

    // Public: only published, ordered by start date ascending
    const allPublished = await ctx.db
      .query("events")
      .withIndex("by_church_and_start_date", (q) =>
        q.eq("churchId", churchId)
      )
      .order("asc")
      .take(200);

    return allPublished.filter(
      (event) => event.status === "published" && event.startDate >= now
    );
  },
});

/**
 * Get an event by church ID and slug.
 * Public for published events.
 */
export const getBySlug = query({
  args: { churchId: v.id("churches"), slug: v.string() },
  handler: async (ctx, { churchId, slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!event) return null;

    if (event.status === "published") return event;

    if (await hasChurchAccess(ctx, churchId)) {
      return event;
    }

    return null;
  },
});

/**
 * Create a new event.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    title: v.string(),
    slug: v.string(),
    status: publishStatus,
    summary: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    location: v.string(),
    registrationUrl: v.optional(v.string()),
    featured: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const existing = await ctx.db
      .query("events")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `An event with slug "${args.slug}" already exists in this church`
      );
    }

    return await ctx.db.insert("events", args);
  },
});

/**
 * Update an existing event.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(publishStatus),
    summary: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    location: v.optional(v.string()),
    registrationUrl: v.optional(v.string()),
    featured: v.optional(v.boolean()),
  },
  handler: async (ctx, { eventId, ...fields }) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");

    await requireChurchAccess(ctx, event.churchId);

    if (fields.slug && fields.slug !== event.slug) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", event.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `An event with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(eventId, patch);
    return eventId;
  },
});

/**
 * Archive an event.
 * Requires church-level access.
 */
export const archive = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");

    await requireChurchAccess(ctx, event.churchId);

    await ctx.db.patch(eventId, { status: "archived" });
    return eventId;
  },
});
