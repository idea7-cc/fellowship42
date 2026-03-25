/**
 * Shared Convex validators used across schema and function files.
 *
 * Centralising enum validators here eliminates triple-maintenance
 * (schema + create args + update args) and guarantees the database,
 * mutations, and TypeScript types all agree on the legal values.
 */
import { v } from "convex/values";

// ── Publish lifecycle ──────────────────────────────────────────────────
export const publishStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived")
);

// ── User roles ─────────────────────────────────────────────────────────
export const userRole = v.union(
  v.literal("super-admin"),
  v.literal("church-admin"),
  v.literal("finance"),
  v.literal("ministry-leader"),
  v.literal("member")
);

// ── Church theme ───────────────────────────────────────────────────────
export const brandPreset = v.union(
  v.literal("warm"),
  v.literal("calm"),
  v.literal("bold"),
  v.literal("classic"),
  v.literal("modern"),
  v.literal("forest"),
  v.literal("royal")
);

export const heroTone = v.union(
  v.literal("warm"),
  v.literal("calm"),
  v.literal("bold"),
  v.literal("classic"),
  v.literal("modern"),
  v.literal("forest"),
  v.literal("royal")
);

export const borderRadius = v.union(
  v.literal("rounded"),
  v.literal("sharp"),
  v.literal("soft")
);

export const fontFamily = v.union(
  v.literal("classic-serif"),
  v.literal("humanist-sans"),
  v.literal("modern-sans"),
  v.literal("neutral-sans"),
  v.literal("serif-display")
);

export const churchTheme = v.object({
  preset: brandPreset,
  accent: v.string(),
  surface: v.string(),
  ink: v.string(),
  heroTone: heroTone,
  radius: borderRadius,
  headingFont: fontFamily,
  bodyFont: fontFamily,
});

// ── People ─────────────────────────────────────────────────────────────
export const membershipStatus = v.union(
  v.literal("guest"),
  v.literal("regular-attender"),
  v.literal("member"),
  v.literal("volunteer"),
  v.literal("inactive")
);

// ── Groups ─────────────────────────────────────────────────────────────
export const groupType = v.union(
  v.literal("small-group"),
  v.literal("sunday-school"),
  v.literal("bible-study"),
  v.literal("support-group"),
  v.literal("serving-team"),
  v.literal("training-cohort")
);

export const groupMemberRole = v.union(
  v.literal("member"),
  v.literal("leader"),
  v.literal("apprentice"),
  v.literal("host")
);

export const groupMemberStatus = v.union(
  v.literal("interested"),
  v.literal("pending"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("completed")
);

export const sessionStatus = v.union(
  v.literal("planned"),
  v.literal("submitted")
);

export const attendanceStatus = v.union(
  v.literal("present"),
  v.literal("absent"),
  v.literal("excused"),
  v.literal("serving")
);

// ── Courses ────────────────────────────────────────────────────────────
export const courseType = v.union(
  v.literal("new-member"),
  v.literal("volunteer-training"),
  v.literal("discipleship"),
  v.literal("leadership"),
  v.literal("bible-study"),
  v.literal("curriculum")
);

export const deliveryMode = v.union(
  v.literal("self-paced"),
  v.literal("group-led"),
  v.literal("cohort"),
  v.literal("hybrid")
);

export const enrollmentStatus = v.union(
  v.literal("invited"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived")
);

// ── Facilities ─────────────────────────────────────────────────────────
export const roomType = v.union(
  v.literal("sanctuary"),
  v.literal("classroom"),
  v.literal("lobby"),
  v.literal("office"),
  v.literal("multipurpose")
);

export const roomAvailability = v.union(
  v.literal("available"),
  v.literal("reserved"),
  v.literal("maintenance"),
  v.literal("decommissioned")
);

// ── Media ──────────────────────────────────────────────────────────────
export const mediaType = v.union(
  v.literal("image"),
  v.literal("worksheet"),
  v.literal("lesson-guide"),
  v.literal("video"),
  v.literal("handbook")
);

// ── Contributions ──────────────────────────────────────────────────────
export const fundType = v.union(
  v.literal("general"),
  v.literal("missions"),
  v.literal("benevolence"),
  v.literal("building")
);

export const paymentMethod = v.union(
  v.literal("card"),
  v.literal("ach"),
  v.literal("cash"),
  v.literal("check")
);

export const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("succeeded"),
  v.literal("refunded")
);

// ── Landing pages ──────────────────────────────────────────────────────
export const pageType = v.union(
  v.literal("ministry"),
  v.literal("group"),
  v.literal("course")
);

export const themeMode = v.union(
  v.literal("inherit"),
  v.literal("custom")
);

export const landingPageBlock = v.union(
  v.object({
    blockType: v.literal("hero"),
    heading: v.optional(v.string()),
    subheading: v.optional(v.string()),
    imageId: v.optional(v.string()),
    ctaLabel: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("text"),
    heading: v.optional(v.string()),
    body: v.string(),
  }),
  v.object({
    blockType: v.literal("image"),
    imageId: v.string(),
    alt: v.optional(v.string()),
    caption: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("gallery"),
    images: v.array(
      v.object({
        imageId: v.string(),
        alt: v.optional(v.string()),
      })
    ),
  }),
  v.object({
    blockType: v.literal("video"),
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("cta"),
    heading: v.optional(v.string()),
    body: v.optional(v.string()),
    buttonLabel: v.string(),
    buttonUrl: v.string(),
  }),
  v.object({
    blockType: v.literal("faq"),
    items: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
      })
    ),
  }),
  v.object({
    blockType: v.literal("testimonial"),
    quote: v.string(),
    author: v.string(),
    role: v.optional(v.string()),
  }),
  v.object({
    blockType: v.literal("schedule"),
    heading: v.optional(v.string()),
    items: v.array(
      v.object({
        label: v.string(),
        day: v.string(),
        time: v.string(),
      })
    ),
  }),
  v.object({
    blockType: v.literal("contact"),
    heading: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  })
);

// ── Days of week ───────────────────────────────────────────────────────
export const dayOfWeek = v.union(
  v.literal("sunday"),
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday")
);
