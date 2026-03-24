import { QueryCtx, MutationCtx } from "convex/server";
import { Id } from "../_generated/dataModel";

/**
 * User document shape from the users table.
 * Mirrors the schema definition so helpers can inspect roles/churchIds.
 */
export interface UserDoc {
  _id: Id<"users">;
  _creationTime: number;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  churchIds: Id<"churches">[];
  personId?: Id<"people">;
  clerkId?: string;
}

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
 * Resolves the authenticated caller to a `users` document.
 * Throws if the identity has no matching row (user must be provisioned first).
 */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  const identity = await requireAuth(ctx);

  // Clerk stores the user ID in the `subject` field of the JWT
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User record not found. Please complete onboarding.");
  }
  return user as UserDoc;
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
