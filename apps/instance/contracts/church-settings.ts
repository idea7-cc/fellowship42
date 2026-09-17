import { z } from 'zod'
import type { Church, Course, EventRecord, Group, Sermon } from './api'

const text = (max: number) => z.string().trim().max(max)
const webUrl = text(2_048).refine((value) => {
  if (!value) return true
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}, 'Use an http or https URL')
const mediaId = z.string().min(1).max(128).nullable()
export const churchDraftSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    tagline: text(160),
    summary: text(4_000),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value })
          return true
        } catch {
          return false
        }
      }, 'Choose a valid timezone'),
    street: text(240),
    city: text(120),
    region: text(120),
    postalCode: text(30),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    phone: text(60),
    email: z.union([z.literal(''), z.email().max(320)]),
    websiteUrl: webUrl,
    givingUrl: webUrl,
    livestreamUrl: webUrl,
    themePreset: z.enum([
      'warm',
      'calm',
      'bold',
      'classic',
      'modern',
      'forest',
      'royal',
    ]),
    logoMediaId: mediaId,
    coverMediaId: mediaId,
    serviceTimes: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            day: z.number().int().min(0).max(6),
            time: z
              .string()
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid time'),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
export type ChurchDraft = z.infer<typeof churchDraftSchema>
export interface ChurchSettings {
  draft: ChurchDraft
  version: number
  published: boolean
  hasDraft: boolean
  readiness: { profile: boolean; services: boolean; content: boolean }
}
export interface ChurchSite {
  church: Church
  groups: Group[]
  courses: Course[]
  events: EventRecord[]
  sermons: Sermon[]
}
