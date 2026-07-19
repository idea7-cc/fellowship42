import type {
  Church,
  Course,
  EventRecord,
  Group,
  Lesson,
  Ministry,
  Person,
  Sermon,
} from '../../src/lib/api-types'

export interface ChurchRow {
  id: string
  slug: string
  name: string
  status: Church['status']
  timezone: string
  tagline: string
  summary: string
  street: string
  city: string
  region: string
  postal_code: string
  country_code: string
  phone: string | null
  email: string | null
  website_url: string | null
  giving_url: string | null
  livestream_url: string | null
  theme_preset: string
  theme_accent: string | null
  theme_surface: string | null
  theme_ink: string | null
  theme_hero_tone: string | null
  theme_radius: string | null
  theme_heading_font: string | null
  theme_body_font: string | null
}

export interface ServiceTimeRow {
  id: string
  label: string
  day_of_week: number
  local_time: string
}

export const churchSelect = `
  SELECT
    c.id, c.slug, c.name, c.status, c.timezone,
    p.tagline, p.summary, p.street, p.city, p.region, p.postal_code,
    p.country_code, p.phone, p.email, p.website_url, p.giving_url,
    p.livestream_url, p.theme_preset, p.theme_accent, p.theme_surface,
    p.theme_ink, p.theme_hero_tone, p.theme_radius, p.theme_heading_font,
    p.theme_body_font
  FROM churches c
  JOIN church_profiles p ON p.church_id = c.id
`

export function mapChurch(row: ChurchRow, serviceTimes: ServiceTimeRow[]): Church {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    tagline: row.tagline,
    summary: row.summary,
    timezone: row.timezone,
    address: {
      street: row.street,
      city: row.city,
      state: row.region,
      postalCode: row.postal_code,
      countryCode: row.country_code,
    },
    contact: {
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      website: row.website_url ?? undefined,
    },
    givingUrl: row.giving_url ?? undefined,
    livestreamUrl: row.livestream_url ?? undefined,
    theme: {
      preset: row.theme_preset,
      accent: row.theme_accent,
      surface: row.theme_surface,
      ink: row.theme_ink,
      heroTone: row.theme_hero_tone,
      radius: row.theme_radius,
      headingFont: row.theme_heading_font,
      bodyFont: row.theme_body_font,
    },
    serviceTimes: serviceTimes.map((service) => ({
      id: service.id,
      label: service.label,
      day: service.day_of_week,
      time: service.local_time,
    })),
  }
}

export interface MinistryRow {
  id: string
  church_id: string
  slug: string
  title: string
  status: Ministry['status']
  audience: string
  schedule: string
  featured: number
  summary: string
}

export function mapMinistry(row: MinistryRow): Ministry {
  return {
    id: row.id,
    churchId: row.church_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    audience: row.audience,
    schedule: row.schedule,
    featured: row.featured === 1,
    summary: row.summary,
  }
}

export interface GroupRow {
  id: string
  church_id: string
  ministry_id: string | null
  slug: string
  title: string
  status: Group['status']
  group_type: string
  audience: string
  schedule: string
  location: string | null
  enrollment_policy: string
  capacity: number | null
  featured: number
  summary: string
}

export function mapGroup(row: GroupRow): Group {
  return {
    id: row.id,
    churchId: row.church_id,
    ministryId: row.ministry_id ?? undefined,
    slug: row.slug,
    title: row.title,
    status: row.status,
    groupType: row.group_type,
    audience: row.audience,
    schedule: row.schedule,
    location: row.location ?? undefined,
    openEnrollment: row.enrollment_policy === 'open',
    capacity: row.capacity ?? undefined,
    featured: row.featured === 1,
    summary: row.summary,
  }
}

export interface CourseRow {
  id: string
  church_id: string
  ministry_id: string | null
  slug: string
  title: string
  status: Course['status']
  course_type: string
  delivery_mode: string
  audience: string
  duration: string
  featured: number
  certificate_offered: number
  summary: string
  lesson_count: number
}

export function mapCourse(row: CourseRow): Course {
  return {
    id: row.id,
    churchId: row.church_id,
    ministryId: row.ministry_id ?? undefined,
    slug: row.slug,
    title: row.title,
    status: row.status,
    courseType: row.course_type,
    deliveryMode: row.delivery_mode,
    audience: row.audience,
    duration: row.duration,
    featured: row.featured === 1,
    certificateOffered: row.certificate_offered === 1,
    summary: row.summary,
    lessonCount: row.lesson_count,
  }
}

export interface LessonRow {
  id: string
  course_id: string
  title: string
  summary: string
  estimated_minutes: number | null
  required: number
  sort_order: number
}

export function mapLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    summary: row.summary,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    required: row.required === 1,
    sortOrder: row.sort_order,
  }
}

export interface EventRow {
  id: string
  church_id: string
  slug: string
  title: string
  status: EventRecord['status']
  summary: string
  starts_at: number
  ends_at: number | null
  location: string
  registration_url: string | null
  featured: number
}

export function mapEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    churchId: row.church_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    summary: row.summary,
    startDate: row.starts_at,
    endDate: row.ends_at ?? undefined,
    location: row.location,
    registrationUrl: row.registration_url ?? undefined,
    featured: row.featured === 1,
  }
}

export interface SermonRow {
  id: string
  church_id: string
  slug: string
  title: string
  status: Sermon['status']
  speaker: string
  series: string | null
  summary: string
  video_url: string | null
  preached_at: number
  featured: number
}

export function mapSermon(row: SermonRow): Sermon {
  return {
    id: row.id,
    churchId: row.church_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    speaker: row.speaker,
    series: row.series ?? undefined,
    summary: row.summary,
    videoUrl: row.video_url ?? undefined,
    preachedAt: row.preached_at,
    featured: row.featured === 1,
  }
}

export interface PersonRow {
  id: string
  church_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  membership_status: string
  volunteer_ready: number
}

export function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    churchId: row.church_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    membershipStatus: row.membership_status,
    volunteerReady: row.volunteer_ready === 1,
  }
}
