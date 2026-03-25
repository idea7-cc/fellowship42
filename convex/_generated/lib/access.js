// ── Identity helpers ────────────────────────────────────────────────────
/**
 * Ensures the caller is authenticated via Clerk.
 * Returns the Convex `UserIdentity` or throws.
 */
export async function requireAuth(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new Error("Authentication required");
    }
    return identity;
}
/**
 * Returns the authenticated user's row, or `null` when the caller is either
 * unauthenticated or not yet provisioned in the `users` table.
 */
export async function getCurrentUser(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return null;
    }
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    return user ?? null;
}
/**
 * Resolves the authenticated caller to a `users` document.
 * Throws if the identity has no matching row (user must be provisioned first).
 */
export async function requireUser(ctx) {
    await requireAuth(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
        throw new Error("User record not found. Please complete onboarding.");
    }
    return user;
}
// ── Role helpers ────────────────────────────────────────────────────────
/** Returns `true` when the user document contains the `super-admin` role. */
export function isSuperAdmin(user) {
    return user.roles.includes("super-admin");
}
/** Returns `true` when the user has at least one of the supplied roles. */
function hasAnyRole(user, roles) {
    return user.roles.some((r) => roles.includes(r));
}
/**
 * Ensures the current user holds at least one of the given roles.
 * Returns the resolved user document for convenience.
 */
export async function requireRole(ctx, roles) {
    const user = await requireUser(ctx);
    if (isSuperAdmin(user))
        return user; // super-admin bypasses all role checks
    if (!hasAnyRole(user, roles)) {
        throw new Error(`Insufficient permissions. Required one of: ${roles.join(", ")}`);
    }
    return user;
}
// ── Church-scoped helpers ───────────────────────────────────────────────
/**
 * Returns `true` when the user is a super-admin or the church ID appears
 * in their `churchIds` list.
 */
export function canManageChurch(user, churchId) {
    if (isSuperAdmin(user))
        return true;
    return user.churchIds.some((id) => id === churchId);
}
/**
 * Returns `true` when the current caller is authenticated, provisioned, and
 * authorized to access the supplied church.
 */
export async function hasChurchAccess(ctx, churchId) {
    const user = await getCurrentUser(ctx);
    if (!user) {
        return false;
    }
    return canManageChurch(user, churchId);
}
/**
 * Ensures the current user can access the given church.
 * Returns the resolved user document.
 */
export async function requireChurchAccess(ctx, churchId) {
    const user = await requireUser(ctx);
    if (!canManageChurch(user, churchId)) {
        throw new Error("You do not have access to this church");
    }
    return user;
}
