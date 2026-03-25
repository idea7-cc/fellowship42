import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { requireChurchScopedDocument } from "./lib/records";
import { attendanceStatus } from "./lib/validators";

/**
 * List all attendance records for a session.
 * Requires church access.
 */
export const listBySession = query({
  args: { sessionId: v.id("groupSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return [];

    await requireChurchAccess(ctx, session.churchId);

    return await ctx.db
      .query("attendanceRecords")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(200);
  },
});

/**
 * List all attendance records for a person.
 * Requires church access.
 */
export const listByPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return [];

    await requireChurchAccess(ctx, person.churchId);

    return await ctx.db
      .query("attendanceRecords")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .take(200);
  },
});

/**
 * Record or update attendance for a person at a session (upsert).
 * If a record already exists for this session+person, it is updated.
 * Requires church access.
 */
export const record = mutation({
  args: {
    churchId: v.id("churches"),
    sessionId: v.id("groupSessions"),
    personId: v.id("people"),
    status: attendanceStatus,
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);
    const session = await requireChurchScopedDocument(
      ctx,
      args.sessionId,
      args.churchId,
      "Group session"
    );
    await requireChurchScopedDocument(
      ctx,
      args.personId,
      args.churchId,
      "Person"
    );

    // Upsert: check for existing record for this session + person
    const records = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .take(200);

    const existing = records.find((r) => r.personId === args.personId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        checkedInAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("attendanceRecords", {
      churchId: args.churchId,
      groupId: session.groupId,
      sessionId: args.sessionId,
      personId: args.personId,
      status: args.status,
      checkedInAt: Date.now(),
    });
  },
});

/**
 * Remove an attendance record.
 * Requires church access.
 */
export const remove = mutation({
  args: { recordId: v.id("attendanceRecords") },
  handler: async (ctx, { recordId }) => {
    const record = await ctx.db.get(recordId);
    if (!record) throw new Error("Attendance record not found");

    await requireChurchAccess(ctx, record.churchId);

    await ctx.db.delete(recordId);
    return recordId;
  },
});
