import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { requireChurchScopedDocument } from "./lib/records";
import { sessionStatus } from "./lib/validators";

/**
 * List sessions for a group, ordered by sessionDate descending.
 * Requires church access.
 */
export const listByGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get(groupId);
    if (!group) return [];

    await requireChurchAccess(ctx, group.churchId);

    return await ctx.db
      .query("groupSessions")
      .withIndex("by_group_and_date", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(200);
  },
});

/**
 * Get a single group session by ID.
 * Requires church access.
 */
export const getById = query({
  args: { sessionId: v.id("groupSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    await requireChurchAccess(ctx, session.churchId);
    return session;
  },
});

/**
 * Create a new group session.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    groupId: v.id("groups"),
    title: v.string(),
    sessionDate: v.number(),
    location: v.optional(v.string()),
    topic: v.optional(v.string()),
    attendanceStatus: sessionStatus,
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);
    await requireChurchScopedDocument(
      ctx,
      args.groupId,
      args.churchId,
      "Group"
    );

    return await ctx.db.insert("groupSessions", args);
  },
});

/**
 * Update an existing group session.
 * Requires church-level access. Partial patch.
 */
export const update = mutation({
  args: {
    sessionId: v.id("groupSessions"),
    title: v.optional(v.string()),
    sessionDate: v.optional(v.number()),
    location: v.optional(v.string()),
    topic: v.optional(v.string()),
    attendanceStatus: v.optional(sessionStatus),
  },
  handler: async (ctx, { sessionId, ...fields }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Group session not found");

    await requireChurchAccess(ctx, session.churchId);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(sessionId, patch);
    return sessionId;
  },
});

/**
 * Remove a group session and all related attendance records.
 * Requires church-level access.
 */
export const remove = mutation({
  args: { sessionId: v.id("groupSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Group session not found");

    await requireChurchAccess(ctx, session.churchId);

    // Delete all related attendance records
    const records = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(200);

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    // Delete the session itself
    await ctx.db.delete(sessionId);

    return sessionId;
  },
});
