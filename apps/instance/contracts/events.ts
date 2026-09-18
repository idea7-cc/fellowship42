import { z } from 'zod'
const eventStatusSchema = z.enum(['draft', 'published', 'archived'])
export const eventFields = {
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  status: eventStatusSchema,
  summary: z.string().trim().max(4_000),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().positive().nullable(),
  timezone: z.string().trim().min(1).max(64),
  location: z.string().trim().max(240),
  registrationUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .nullable(),
  capacity: z.number().int().positive().max(1_000_000).nullable(),
  featured: z.boolean(),
}
export const eventCreateInput = z
  .object({
    ...eventFields,
    status: eventStatusSchema.default('draft'),
    summary: eventFields.summary.default(''),
    endsAt: eventFields.endsAt.default(null),
    location: eventFields.location.default(''),
    registrationUrl: eventFields.registrationUrl.default(null),
    capacity: eventFields.capacity.default(null),
    featured: eventFields.featured.default(false),
  })
  .strict()
  .refine((value) => value.endsAt === null || value.endsAt > value.startsAt, {
    path: ['endsAt'],
    message: 'Event end must be after its start',
  })
export const eventUpdateInput = z
  .object({
    version: z.number().int().positive(),
    slug: eventFields.slug.optional(),
    title: eventFields.title.optional(),
    status: eventFields.status.optional(),
    summary: eventFields.summary.optional(),
    startsAt: eventFields.startsAt.optional(),
    endsAt: eventFields.endsAt.optional(),
    timezone: eventFields.timezone.optional(),
    location: eventFields.location.optional(),
    registrationUrl: eventFields.registrationUrl.optional(),
    capacity: eventFields.capacity.optional(),
    featured: eventFields.featured.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one event field must be changed',
  })
export const eventListInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: eventStatusSchema.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const agentEventCreateInput = z
  .object({
    requestKey: z.uuid(),
    event: z
      .object(eventFields)
      .omit({ status: true })
      .partial({
        summary: true,
        endsAt: true,
        location: true,
        registrationUrl: true,
        capacity: true,
        featured: true,
      })
      .strict(),
  })
  .strict()
