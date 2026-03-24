import { query, mutation } from "convex/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/access";

/**
 * Get a landing page by its owning entity.
 * Looks up the page by church + pageType + the owner document ID
 * (ministryId, groupId, or courseId depending on pageType).
 */
export const getByOwner = query({
  args: {
    churchId: v.id("churches"),
    pageType: v.union(
      v.literal("ministry"),
      v.literal("group"),
      v.literal("course")
    ),
    ownerId: v.string(), // The raw ID of the owning entity
  },
  handler: async (ctx, { churchId, pageType, ownerId }) => {
    let page = null;

    if (pageType === "ministry") {
      page = await ctx.db
        .query("landingPages")
        .withIndex("by_church_and_ministry", (q) =>
          q.eq("churchId", churchId).eq("ministryId", ownerId as any)
        )
        .first();
    } else if (pageType === "group") {
      page = await ctx.db
        .query("landingPages")
        .withIndex("by_church_and_group", (q) =>
          q.eq("churchId", churchId).eq("groupId", ownerId as any)
        )
        .first();
    } else if (pageType === "course") {
      page = await ctx.db
        .query("landingPages")
        .withIndex("by_church_and_course", (q) =>
          q.eq("churchId", churchId).eq("courseId", ownerId as any)
        )
        .first();
    }

    if (!page) return null;

    // Published pages are public
    if (page.status === "published") return page;

    // Draft pages require church access
    try {
      await requireChurchAccess(ctx, churchId);
      return page;
    } catch {
      return null;
    }
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
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", churchId).eq("slug", slug)
      )
      .unique();

    if (!page) return null;

    if (page.status === "published") return page;

    try {
      await requireChurchAccess(ctx, churchId);
      return page;
    } catch {
      return null;
    }
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
    pageType: v.union(
      v.literal("ministry"),
      v.literal("group"),
      v.literal("course")
    ),
    ministryId: v.optional(v.id("ministries")),
    groupId: v.optional(v.id("groups")),
    courseId: v.optional(v.id("courses")),
    themeMode: v.union(v.literal("inherit"), v.literal("custom")),
    themeOverrides: v.optional(
      v.object({
        accent: v.optional(v.string()),
        surface: v.optional(v.string()),
        ink: v.optional(v.string()),
        heroTone: v.optional(v.string()),
      })
    ),
    seoDescription: v.optional(v.string()),
    blocks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    const existing = await ctx.db
      .query("landingPages")
      .withIndex("by_church_and_slug", (q) =>
        q.eq("churchId", args.churchId).eq("slug", args.slug)
      )
      .unique();
    if (existing) {
      throw new Error(
        `A landing page with slug "${args.slug}" already exists in this church`
      );
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
    pageType: v.optional(
      v.union(
        v.literal("ministry"),
        v.literal("group"),
        v.literal("course")
      )
    ),
    ministryId: v.optional(v.id("ministries")),
    groupId: v.optional(v.id("groups")),
    courseId: v.optional(v.id("courses")),
    themeMode: v.optional(
      v.union(v.literal("inherit"), v.literal("custom"))
    ),
    themeOverrides: v.optional(
      v.object({
        accent: v.optional(v.string()),
        surface: v.optional(v.string()),
        ink: v.optional(v.string()),
        heroTone: v.optional(v.string()),
      })
    ),
    seoDescription: v.optional(v.string()),
    blocks: v.optional(v.array(v.any())),
  },
  handler: async (ctx, { pageId, ...fields }) => {
    const page = await ctx.db.get(pageId);
    if (!page) throw new Error("Landing page not found");

    await requireChurchAccess(ctx, page.churchId);

    if (fields.slug && fields.slug !== page.slug) {
      const existing = await ctx.db
        .query("landingPages")
        .withIndex("by_church_and_slug", (q) =>
          q.eq("churchId", page.churchId).eq("slug", fields.slug!)
        )
        .unique();
      if (existing) {
        throw new Error(
          `A landing page with slug "${fields.slug}" already exists in this church`
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(pageId, patch);
    return pageId;
  },
});
