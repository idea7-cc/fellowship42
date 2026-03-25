import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  hasChurchAccess,
  requireChurchAccess,
} from "./lib/auth";
import { membershipStatus } from "./lib/validators";

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
      .take(200);
  },
});

/**
 * Viewer-safe people lookup for the SPA.
 * Returns `null` when the caller is unauthenticated or lacks church access.
 */
export const listByChurchForViewer = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    if (!(await hasChurchAccess(ctx, churchId))) {
      return null;
    }

    return await ctx.db
      .query("people")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .take(200);
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
    membershipStatus: membershipStatus,
    volunteerReady: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const fullName = `${args.firstName} ${args.lastName}`;
    return await ctx.db.insert("people", { ...args, fullName });
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
    membershipStatus: v.optional(membershipStatus),
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

    // Recompute fullName if either name field changed
    const firstName = fields.firstName ?? person.firstName;
    const lastName = fields.lastName ?? person.lastName;
    if (fields.firstName !== undefined || fields.lastName !== undefined) {
      patch.fullName = `${firstName} ${lastName}`;
    }

    await ctx.db.patch(personId, patch);
    return personId;
  },
});

/**
 * Archive a person (set membership status to inactive).
 * Requires church-level access.
 */
export const archive = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new Error("Person not found");

    await requireChurchAccess(ctx, person.churchId);

    await ctx.db.patch(personId, { membershipStatus: "inactive" });
    return personId;
  },
});
