import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

/**
 * List all people belonging to a church.
 * Requires church-level access.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    await requireChurchAccess(ctx, churchId);
    return await ctx.db
      .query("people")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .collect();
  },
});

/**
 * Get a single person by ID.
 * Requires access to the person's church.
 */
export const getById = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return null;
    await requireChurchAccess(ctx, person.churchId);
    return person;
  },
});

/**
 * Create a new person record within a church.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    householdName: v.optional(v.string()),
    membershipStatus: v.union(
      v.literal("guest"),
      v.literal("regular-attender"),
      v.literal("member"),
      v.literal("volunteer")
    ),
    volunteerReady: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);
    return await ctx.db.insert("people", args);
  },
});

/**
 * Update an existing person record.
 * Requires church-level access.
 */
export const update = mutation({
  args: {
    personId: v.id("people"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    householdName: v.optional(v.string()),
    membershipStatus: v.optional(
      v.union(
        v.literal("guest"),
        v.literal("regular-attender"),
        v.literal("member"),
        v.literal("volunteer")
      )
    ),
    volunteerReady: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...fields }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new Error("Person not found");

    await requireChurchAccess(ctx, person.churchId);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(personId, patch);
    return personId;
  },
});
