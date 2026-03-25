import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageChurch, requireRole } from "./lib/access";
import { requireChurchScopedDocument } from "./lib/records";
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
            .collect();
    },
});
/**
 * Record a new contribution.
 * Requires church-level access.
 */
export const create = mutation({
    args: {
        churchId: v.id("churches"),
        personId: v.optional(v.id("people")),
        donorName: v.string(),
        amount: v.number(),
        fund: v.union(v.literal("general"), v.literal("missions"), v.literal("benevolence"), v.literal("building")),
        paymentMethod: v.union(v.literal("card"), v.literal("ach"), v.literal("cash"), v.literal("check")),
        status: v.union(v.literal("pending"), v.literal("succeeded"), v.literal("refunded")),
        recurring: v.boolean(),
        donatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await requireRole(ctx, ["finance", "church-admin"]);
        if (!canManageChurch(user, args.churchId)) {
            throw new Error("You do not have access to this church");
        }
        if (args.personId) {
            await requireChurchScopedDocument(ctx, args.personId, args.churchId, "Person");
        }
        return await ctx.db.insert("contributions", args);
    },
});
