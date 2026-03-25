import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

export type UserDoc = Doc<"users">;

// ── Identity helpers ────────────────────────────────────────────────────

/**
 * Ensures the caller is authenticated via Clerk.
 * Returns the Convex `UserIdentity` or throws.
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
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
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<UserDoc | null> {
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
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  await requireAuth(ctx);
  const user = await getCurrentUser(ctx);

  if (!user) {
    throw new Error("User record not found. Please complete onboarding.");
  }
  return user;
}

// ── Role helpers ────────────────────────────────────────────────────────

/** Returns `true` when the user document contains the `super-admin` role. */
export function isSuperAdmin(user: UserDoc): boolean {
  return user.roles.includes("super-admin");
}

/** Returns `true` when the user has at least one of the supplied roles. */
function hasAnyRole(user: UserDoc, roles: string[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

/**
 * Ensures the current user holds at least one of the given roles.
 * Returns the resolved user document for convenience.
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: string[]
): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (isSuperAdmin(user)) return user; // super-admin bypasses all role checks
  if (!hasAnyRole(user, roles)) {
    throw new Error(
      `Insufficient permissions. Required one of: ${roles.join(", ")}`
    );
  }
  return user;
}

// ── Church-scoped helpers ───────────────────────────────────────────────

/**
 * Returns `true` when the user is a super-admin or the church ID appears
 * in their `churchIds` list.
 */
export function canManageChurch(user: UserDoc, churchId: Id<"churches">): boolean {
  if (isSuperAdmin(user)) return true;
  return user.churchIds.some((id) => id === churchId);
}

/**
 * Returns `true` when the current caller is authenticated, provisioned, and
 * authorized to access the supplied church.
 */
export async function hasChurchAccess(
  ctx: QueryCtx | MutationCtx,
  churchId: Id<"churches">
): Promise<boolean> {
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
export async function requireChurchAccess(
  ctx: QueryCtx | MutationCtx,
  churchId: Id<"churches">
): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (!canManageChurch(user, churchId)) {
    throw new Error("You do not have access to this church");
  }
  return user;
}
