import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hasChurchAccess, requireChurchAccess } from "./lib/access";
import { requireChurchScopedDocument } from "./lib/records";
function assertOwnerFieldsMatchPageType(pageType, owners) {
    const providedOwners = [
        ["ministry", owners.ministryId],
        ["group", owners.groupId],
        ["course", owners.courseId],
    ].filter(([, ownerId]) => ownerId !== undefined);
    if (providedOwners.length !== 1 || providedOwners[0][0] !== pageType) {
        throw new Error("Landing pages must reference exactly one owner matching their pageType");
    }
}
async function ensureOwnerBelongsToChurch(ctx, churchId, pageType, owners) {
    if (pageType === "ministry" && owners.ministryId) {
        await requireChurchScopedDocument(ctx, owners.ministryId, churchId, "Ministry");
    }
    if (pageType === "group" && owners.groupId) {
        await requireChurchScopedDocument(ctx, owners.groupId, churchId, "Group");
    }
    if (pageType === "course" && owners.courseId) {
        await requireChurchScopedDocument(ctx, owners.courseId, churchId, "Course");
    }
}
async function findPageByOwner(ctx, churchId, pageType, owners) {
    if (pageType === "ministry" && owners.ministryId) {
        return await ctx.db
            .query("landingPages")
            .withIndex("by_church_and_ministry", (q) => q.eq("churchId", churchId).eq("ministryId", owners.ministryId))
            .first();
    }
    if (pageType === "group" && owners.groupId) {
        return await ctx.db
            .query("landingPages")
            .withIndex("by_church_and_group", (q) => q.eq("churchId", churchId).eq("groupId", owners.groupId))
            .first();
    }
    if (pageType === "course" && owners.courseId) {
        return await ctx.db
            .query("landingPages")
            .withIndex("by_church_and_course", (q) => q.eq("churchId", churchId).eq("courseId", owners.courseId))
            .first();
    }
    return null;
}
/**
 * Get a landing page by its owning entity.
 * Looks up the page by church + pageType + the owner document ID
 * (ministryId, groupId, or courseId depending on pageType).
 */
export const getByOwner = query({
    args: {
        churchId: v.id("churches"),
        pageType: v.union(v.literal("ministry"), v.literal("group"), v.literal("course")),
        ownerId: v.string(), // The raw ID of the owning entity
    },
    handler: async (ctx, { churchId, pageType, ownerId }) => {
        let page = null;
        if (pageType === "ministry") {
            page = await ctx.db
                .query("landingPages")
                .withIndex("by_church_and_ministry", (q) => q.eq("churchId", churchId).eq("ministryId", ownerId))
                .first();
        }
        else if (pageType === "group") {
            page = await ctx.db
                .query("landingPages")
                .withIndex("by_church_and_group", (q) => q.eq("churchId", churchId).eq("groupId", ownerId))
                .first();
        }
        else if (pageType === "course") {
            page = await ctx.db
                .query("landingPages")
                .withIndex("by_church_and_course", (q) => q.eq("churchId", churchId).eq("courseId", ownerId))
                .first();
        }
        if (!page)
            return null;
        // Published pages are public
        if (page.status === "published")
            return page;
        // Draft pages require church access
        if (await hasChurchAccess(ctx, churchId)) {
            return page;
        }
        return null;
    },
});
/**
 * Get a landing page by church and slug.
 * Public for published pages.
 */
export const getBySlug = query({
    args: { churchId: v.id("churches"), slug: v.string() },
    handler: async (ctx, { churchId, slug }) => {
        const page = await ctx.db
            .query("landingPages")
            .withIndex("by_church_and_slug", (q) => q.eq("churchId", churchId).eq("slug", slug))
            .unique();
        if (!page)
            return null;
        if (page.status === "published")
            return page;
        if (await hasChurchAccess(ctx, churchId)) {
            return page;
        }
        return null;
    },
});
/**
 * Create a new landing page.
 * Requires church-level access.
 */
export const create = mutation({
    args: {
        churchId: v.id("churches"),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("published")),
        pageType: v.union(v.literal("ministry"), v.literal("group"), v.literal("course")),
        ministryId: v.optional(v.id("ministries")),
        groupId: v.optional(v.id("groups")),
        courseId: v.optional(v.id("courses")),
        themeMode: v.union(v.literal("inherit"), v.literal("custom")),
        themeOverrides: v.optional(v.object({
            accent: v.optional(v.string()),
            surface: v.optional(v.string()),
            ink: v.optional(v.string()),
            heroTone: v.optional(v.string()),
        })),
        seoDescription: v.optional(v.string()),
        blocks: v.array(v.any()),
    },
    handler: async (ctx, args) => {
        await requireChurchAccess(ctx, args.churchId);
        assertOwnerFieldsMatchPageType(args.pageType, args);
        await ensureOwnerBelongsToChurch(ctx, args.churchId, args.pageType, args);
        const existing = await ctx.db
            .query("landingPages")
            .withIndex("by_church_and_slug", (q) => q.eq("churchId", args.churchId).eq("slug", args.slug))
            .unique();
        if (existing) {
            throw new Error(`A landing page with slug "${args.slug}" already exists in this church`);
        }
        const existingOwnerPage = await findPageByOwner(ctx, args.churchId, args.pageType, args);
        if (existingOwnerPage) {
            throw new Error("A landing page already exists for this owning record in this church");
        }
        return await ctx.db.insert("landingPages", args);
    },
});
/**
 * Update an existing landing page.
 * Requires church-level access.
 */
export const update = mutation({
    args: {
        pageId: v.id("landingPages"),
        title: v.optional(v.string()),
        slug: v.optional(v.string()),
        status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
        pageType: v.optional(v.union(v.literal("ministry"), v.literal("group"), v.literal("course"))),
        ministryId: v.optional(v.id("ministries")),
        groupId: v.optional(v.id("groups")),
        courseId: v.optional(v.id("courses")),
        themeMode: v.optional(v.union(v.literal("inherit"), v.literal("custom"))),
        themeOverrides: v.optional(v.object({
            accent: v.optional(v.string()),
            surface: v.optional(v.string()),
            ink: v.optional(v.string()),
            heroTone: v.optional(v.string()),
        })),
        seoDescription: v.optional(v.string()),
        blocks: v.optional(v.array(v.any())),
    },
    handler: async (ctx, { pageId, ...fields }) => {
        const page = await ctx.db.get(pageId);
        if (!page)
            throw new Error("Landing page not found");
        await requireChurchAccess(ctx, page.churchId);
        const nextPageType = fields.pageType ?? page.pageType;
        const nextOwners = {
            ministryId: fields.ministryId ?? page.ministryId,
            groupId: fields.groupId ?? page.groupId,
            courseId: fields.courseId ?? page.courseId,
        };
        assertOwnerFieldsMatchPageType(nextPageType, nextOwners);
        await ensureOwnerBelongsToChurch(ctx, page.churchId, nextPageType, nextOwners);
        if (fields.slug && fields.slug !== page.slug) {
            const existing = await ctx.db
                .query("landingPages")
                .withIndex("by_church_and_slug", (q) => q.eq("churchId", page.churchId).eq("slug", fields.slug))
                .unique();
            if (existing) {
                throw new Error(`A landing page with slug "${fields.slug}" already exists in this church`);
            }
        }
        const existingOwnerPage = await findPageByOwner(ctx, page.churchId, nextPageType, nextOwners);
        if (existingOwnerPage && existingOwnerPage._id !== pageId) {
            throw new Error("A landing page already exists for this owning record in this church");
        }
        const patch = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined)
                patch[key] = value;
        }
        await ctx.db.patch(pageId, patch);
        return pageId;
    },
});
