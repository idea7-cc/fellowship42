import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAuth } from "./lib/auth";
import { userRole } from "./lib/validators";

/**
 * Sync (upsert) a user record from the current auth identity.
 * Called after sign-in to ensure every authenticated user has a
 * corresponding row in the `users` table. All identity fields are
 * derived from `ctx.auth.getUserIdentity()` — the mutation args are empty.
 */
export const syncFromAuth = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);

    // Look up existing user by tokenIdentifier
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      // Update profile fields that may have changed at the provider
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        firstName: identity.firstName ?? existing.firstName,
        lastName: identity.lastName ?? existing.lastName,
        avatarUrl: identity.avatarUrl,
      });
      return existing._id;
    }

    // Create a new user with the default "member" role
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? "",
      firstName: identity.firstName ?? "",
      lastName: identity.lastName ?? "",
      avatarUrl: identity.avatarUrl,
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
  handler: async (ctx) => getCurrentUser(ctx),
});

/**
 * Update a user's roles.
 * Internal-only — not publicly callable. Used by admin tooling.
 */
export const updateRoles = internalMutation({
  args: {
    userId: v.id("users"),
    roles: v.array(userRole),
  },
  handler: async (ctx, { userId, roles }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");

    await ctx.db.patch(userId, { roles });
    return userId;
  },
});

/**
 * Assign a church to a user's churchIds array.
 * Internal-only — not publicly callable.
 */
export const assignChurch = internalMutation({
  args: {
    userId: v.id("users"),
    churchId: v.id("churches"),
  },
  handler: async (ctx, { userId, churchId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Only add if not already present
    if (!user.churchIds.some((id) => id === churchId)) {
      await ctx.db.patch(userId, {
        churchIds: [...user.churchIds, churchId],
      });
    }

    return userId;
  },
});
