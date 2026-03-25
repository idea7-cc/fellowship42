import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageChurch, requireRole } from "./lib/auth";
import { requireChurchScopedDocument } from "./lib/records";
import { fundType, paymentMethod, paymentStatus } from "./lib/validators";

/**
 * List contributions for a church, ordered by donation date descending.
 * Restricted to users with the "finance" role (or super-admin).
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    // Finance data requires both the finance role and church access
    const user = await requireRole(ctx, ["finance", "church-admin"]);

    // Also verify the user can access this specific church
    if (!canManageChurch(user, churchId)) {
      throw new Error("You do not have access to this church");
    }

    return await ctx.db
      .query("contributions")
      .withIndex("by_church_and_date", (q) => q.eq("churchId", churchId))
      .order("desc")
      .take(200);
  },
});

/**
 * Record a new contribution.
 * Requires finance or church-admin role and church access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    personId: v.optional(v.id("people")),
    donorName: v.string(),
    amount: v.number(),
    fund: fundType,
    paymentMethod: paymentMethod,
    status: paymentStatus,
    recurring: v.boolean(),
    donatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["finance", "church-admin"]);
    if (!canManageChurch(user, args.churchId)) {
      throw new Error("You do not have access to this church");
    }
    if (args.personId) {
      await requireChurchScopedDocument(
        ctx,
        args.personId,
        args.churchId,
        "Person"
      );
    }

    return await ctx.db.insert("contributions", args);
  },
});
