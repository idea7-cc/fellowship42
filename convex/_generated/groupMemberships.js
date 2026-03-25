import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";
import { requireChurchScopedDocument } from "./lib/records";
/**
 * List all memberships for a given group.
 * Requires access to the group's church.
 */
export const listByGroup = query({
    args: { groupId: v.id("groups") },
    handler: async (ctx, { groupId }) => {
        const group = await ctx.db.get(groupId);
        if (!group)
            return [];
        await requireChurchAccess(ctx, group.churchId);
        return await ctx.db
            .query("groupMemberships")
            .withIndex("by_group", (q) => q.eq("groupId", groupId))
            .collect();
    },
});
/**
 * List all group memberships for a given person.
 * Requires access to the person's church.
 */
export const listByPerson = query({
    args: { personId: v.id("people") },
    handler: async (ctx, { personId }) => {
        const person = await ctx.db.get(personId);
        if (!person)
            return [];
        await requireChurchAccess(ctx, person.churchId);
        return await ctx.db
            .query("groupMemberships")
            .withIndex("by_person", (q) => q.eq("personId", personId))
            .collect();
    },
});
/**
 * Join a group (create a membership record).
 * Requires access to the group's church.
 */
export const join = mutation({
    args: {
        churchId: v.id("churches"),
        groupId: v.id("groups"),
        personId: v.id("people"),
        role: v.union(v.literal("member"), v.literal("leader"), v.literal("apprentice"), v.literal("host")),
        status: v.union(v.literal("interested"), v.literal("pending"), v.literal("active"), v.literal("paused"), v.literal("completed")),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireChurchAccess(ctx, args.churchId);
        await requireChurchScopedDocument(ctx, args.groupId, args.churchId, "Group");
        await requireChurchScopedDocument(ctx, args.personId, args.churchId, "Person");
        // Prevent duplicate memberships
        const existing = await ctx.db
            .query("groupMemberships")
            .withIndex("by_group_and_person", (q) => q.eq("groupId", args.groupId).eq("personId", args.personId))
            .unique();
        if (existing) {
            throw new Error("This person is already a member of this group");
        }
        return await ctx.db.insert("groupMemberships", {
            ...args,
            joinedAt: Date.now(),
        });
    },
});
/**
 * Update the status (or role) of an existing group membership.
 * Requires access to the membership's church.
 */
export const updateStatus = mutation({
    args: {
        membershipId: v.id("groupMemberships"),
        role: v.optional(v.union(v.literal("member"), v.literal("leader"), v.literal("apprentice"), v.literal("host"))),
        status: v.optional(v.union(v.literal("interested"), v.literal("pending"), v.literal("active"), v.literal("paused"), v.literal("completed"))),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, { membershipId, ...fields }) => {
        const membership = await ctx.db.get(membershipId);
        if (!membership)
            throw new Error("Membership not found");
        await requireChurchAccess(ctx, membership.churchId);
        const patch = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined)
                patch[key] = value;
        }
        await ctx.db.patch(membershipId, patch);
        return membershipId;
    },
});
