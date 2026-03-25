import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { roomType, roomAvailability } from "./lib/validators";

/**
 * List all facilities for a church.
 * Requires church access.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    await requireChurchAccess(ctx, churchId);

    return await ctx.db
      .query("facilities")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .take(200);
  },
});

/**
 * Get a single facility by ID.
 * Requires church access.
 */
export const getById = query({
  args: { facilityId: v.id("facilities") },
  handler: async (ctx, { facilityId }) => {
    const facility = await ctx.db.get(facilityId);
    if (!facility) return null;

    await requireChurchAccess(ctx, facility.churchId);
    return facility;
  },
});

/**
 * Create a new facility.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    name: v.string(),
    roomType: roomType,
    capacity: v.number(),
    availability: roomAvailability,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    return await ctx.db.insert("facilities", args);
  },
});

/**
 * Update an existing facility.
 * Requires church-level access. Partial patch.
 */
export const update = mutation({
  args: {
    facilityId: v.id("facilities"),
    name: v.optional(v.string()),
    roomType: v.optional(roomType),
    capacity: v.optional(v.number()),
    availability: v.optional(roomAvailability),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { facilityId, ...fields }) => {
    const facility = await ctx.db.get(facilityId);
    if (!facility) throw new Error("Facility not found");

    await requireChurchAccess(ctx, facility.churchId);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(facilityId, patch);
    return facilityId;
  },
});

/**
 * Decommission a facility.
 * Sets availability to "decommissioned".
 * Requires church-level access.
 */
export const decommission = mutation({
  args: { facilityId: v.id("facilities") },
  handler: async (ctx, { facilityId }) => {
    const facility = await ctx.db.get(facilityId);
    if (!facility) throw new Error("Facility not found");

    await requireChurchAccess(ctx, facility.churchId);

    await ctx.db.patch(facilityId, { availability: "decommissioned" });
    return facilityId;
  },
});
