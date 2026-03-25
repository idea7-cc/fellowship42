/**
 * Provider-agnostic authentication and authorization helpers.
 *
 * ## Design
 *
 * Convex's `ctx.auth.getUserIdentity()` already abstracts the auth provider —
 * it returns a standard OIDC `UserIdentity` regardless of whether the JWT was
 * issued by Clerk, WorkOS, Auth0, or any other provider.
 *
 * This module normalises provider-specific claim differences into a single
 * `AppIdentity` type and uses `tokenIdentifier` (not `subject`) as the
 * canonical user lookup key, per the Convex guidelines.
 *
 * ## Swapping providers
 *
 * To change the auth provider you need to update exactly two files:
 *   1. `convex/auth.config.ts` — point `domain` at the new provider's OIDC issuer
 *   2. `apps/app/src/lib/auth-provider.tsx` — swap the React provider + useAuth hook
 *
 * No Convex function code needs to change.
 */
import { UserIdentity } from "convex/server";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

// ── Types ──────────────────────────────────────────────────────────────

export type UserDoc = Doc<"users">;
type Ctx = QueryCtx | MutationCtx;

/**
 * Normalised identity derived from any OIDC-compatible auth provider.
 * Every field comes from standard OIDC claims — no provider-specific keys.
 */
export interface AppIdentity {
  /** Stable, globally unique identifier (includes issuer). Use for all DB lookups. */
  tokenIdentifier: string;
  /** Provider-specific subject claim (Clerk user ID, WorkOS user ID, etc.) */
  subject: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// ── Identity resolution ────────────────────────────────────────────────

/**
 * Map the raw Convex `UserIdentity` into our normalised `AppIdentity`.
 * This is the only function that needs to understand provider-specific
 * differences in claim naming.
 */
export function resolveIdentity(identity: UserIdentity): AppIdentity {
  return {
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
    email: identity.email ?? undefined,
    firstName:
      identity.givenName ?? identity.name?.split(" ")[0] ?? undefined,
    lastName:
      identity.familyName ??
      identity.name?.split(" ").slice(1).join(" ") ??
      undefined,
    avatarUrl: identity.pictureUrl ?? undefined,
  };
}

// ── Authentication ─────────────────────────────────────────────────────

/** Returns the normalised identity or `null` when unauthenticated. */
export async function getIdentity(ctx: Ctx): Promise<AppIdentity | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? resolveIdentity(identity) : null;
}

/** Requires an authenticated caller. Throws otherwise. */
export async function requireAuth(ctx: Ctx): Promise<AppIdentity> {
  const identity = await getIdentity(ctx);
  if (!identity) {
    throw new Error("Authentication required");
  }
  return identity;
}

// ── User resolution ────────────────────────────────────────────────────

/** Returns the users table row for the current caller, or `null`. */
export async function getCurrentUser(ctx: Ctx): Promise<UserDoc | null> {
  const identity = await getIdentity(ctx);
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  return user ?? null;
}

/** Returns the users table row. Throws if not authenticated or not provisioned. */
export async function requireUser(ctx: Ctx): Promise<UserDoc> {
  await requireAuth(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("User record not found. Please complete onboarding.");
  }
  return user;
}

// ── Role helpers ───────────────────────────────────────────────────────

export function isSuperAdmin(user: UserDoc): boolean {
  return user.roles.includes("super-admin");
}

export function hasAnyRole(
  user: UserDoc,
  roles: Array<Doc<"users">["roles"][number]>
): boolean {
  if (isSuperAdmin(user)) return true;
  return user.roles.some((r) => (roles as string[]).includes(r));
}

/** Ensures the current user holds at least one of the given roles. */
export async function requireRole(
  ctx: Ctx,
  roles: Array<Doc<"users">["roles"][number]>
): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (!hasAnyRole(user, roles)) {
    throw new Error(
      `Insufficient permissions. Required one of: ${roles.join(", ")}`
    );
  }
  return user;
}

// ── Church-scoped helpers ──────────────────────────────────────────────

export function canManageChurch(
  user: UserDoc,
  churchId: Id<"churches">
): boolean {
  if (isSuperAdmin(user)) return true;
  return user.churchIds.some((id) => id === churchId);
}

/** Returns `true` when the current caller can access the given church. */
export async function hasChurchAccess(
  ctx: Ctx,
  churchId: Id<"churches">
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return canManageChurch(user, churchId);
}

/** Requires church-level access. Returns the resolved user document. */
export async function requireChurchAccess(
  ctx: Ctx,
  churchId: Id<"churches">
): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (!canManageChurch(user, churchId)) {
    throw new Error("You do not have access to this church");
  }
  return user;
}
