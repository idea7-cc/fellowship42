import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./lib/access";

/**
 * Upsert a user record from a Clerk identity.
 * Called after Clerk sign-in or from a webhook to ensure every
 * authenticated user has a corresponding row in the `users` table.
 */
export const getOrCreateFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, { clerkId, email, firstName, lastName }) => {
    // Look up existing user by Clerk ID
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      // Update basic profile fields that may have changed in Clerk
      await ctx.db.patch(existing._id, { email, firstName, lastName });
      return existing._id;
    }

    // Create a new user with the default "member" role
    return await ctx.db.insert("users", {
      clerkId,
      email,
      firstName,
      lastName,
      roles: ["member"],
      churchIds: [],
    });
  },
});

/**
 * Get the currently authenticated user document.
 * Returns `null` when the caller is not authenticated or has no user row.
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return user ?? null;
  },
});

/**
 * Update a user's roles.
 * Restricted to super-admin users.
 */
export const updateRoles = mutation({
  args: {
    userId: v.id("users"),
    roles: v.array(v.string()),
  },
  handler: async (ctx, { userId, roles }) => {
    await requireRole(ctx, ["super-admin"]);

    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");

    await ctx.db.patch(userId, { roles });
    return userId;
  },
});
