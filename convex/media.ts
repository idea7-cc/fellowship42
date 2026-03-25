import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireChurchAccess } from "./lib/auth";
import { mediaType } from "./lib/validators";

/**
 * List all media for a church.
 * Requires church access.
 */
export const listByChurch = query({
  args: { churchId: v.id("churches") },
  handler: async (ctx, { churchId }) => {
    await requireChurchAccess(ctx, churchId);

    return await ctx.db
      .query("media")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .take(200);
  },
});

/**
 * Get a public URL for a storage file.
 * Public — no authentication required.
 */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

/**
 * Create a new media record.
 * Requires church-level access.
 */
export const create = mutation({
  args: {
    churchId: v.id("churches"),
    resourceType: mediaType,
    alt: v.string(),
    storageId: v.id("_storage"),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChurchAccess(ctx, args.churchId);

    return await ctx.db.insert("media", args);
  },
});

/**
 * Remove a media record and its underlying storage file.
 * Requires church-level access.
 */
export const remove = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, { mediaId }) => {
    const media = await ctx.db.get(mediaId);
    if (!media) throw new Error("Media not found");

    if (media.churchId) {
      await requireChurchAccess(ctx, media.churchId);
    }

    // Delete the storage file
    await ctx.storage.delete(media.storageId);

    // Delete the media record
    await ctx.db.delete(mediaId);

    return mediaId;
  },
});
