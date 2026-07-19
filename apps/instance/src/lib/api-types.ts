import type { ChurchThemeInput } from '@fellowship42/brand'

export type PublishStatus = 'draft' | 'published' | 'archived'

export interface ServiceTime {
  id: string
  label: string
  day: number
  time: string
}

export interface Church {
  id: string
  slug: string
  name: string
  status: PublishStatus
  tagline: string
  summary: string
  timezone: string
  address: {
    street: string
    city: string
    state: string
    postalCode: string
    countryCode: string
  }
  contact: {
    phone?: string
    email?: string
    website?: string
  }
  givingUrl?: string
  livestreamUrl?: string
  theme: ChurchThemeInput
  serviceTimes: ServiceTime[]
}

export interface Ministry {
  id: string
  churchId: string
  slug: string
  title: string
  status: PublishStatus
  audience: string
  schedule: string
  featured: boolean
  summary: string
}

export interface Group {
  id: string
  churchId: string
  ministryId?: string
  slug: string
  title: string
  status: PublishStatus
  groupType: string
  audience: string
  schedule: string
  location?: string
  openEnrollment: boolean
  capacity?: number
  featured: boolean
  summary: string
}

export interface Course {
  id: string
  churchId: string
  ministryId?: string
  slug: string
  title: string
  status: PublishStatus
  courseType: string
  deliveryMode: string
  audience: string
  duration: string
  featured: boolean
  certificateOffered: boolean
  summary: string
  lessonCount: number
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  summary: string
  estimatedMinutes?: number
  required: boolean
  sortOrder: number
}

export interface EventRecord {
  id: string
  churchId: string
  slug: string
  title: string
  status: PublishStatus
  summary: string
  startDate: number
  endDate?: number
  location: string
  registrationUrl?: string
  featured: boolean
}

export interface Sermon {
  id: string
  churchId: string
  slug: string
  title: string
  status: PublishStatus
  speaker: string
  series?: string
  summary: string
  videoUrl?: string
  preachedAt: number
  featured: boolean
}

export interface Person {
  id: string
  churchId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  membershipStatus: string
  volunteerReady: boolean
}

export interface SessionUser {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl?: string
  memberships: Array<{
    churchId: string
    churchName: string
    permissions: string[]
    roles: string[]
  }>
}

export interface SessionResponse {
  user: SessionUser | null
}

export interface ConfiguredChurchInstance {
  churchId: string
  churchName: string
  churchSlug: string
}

export type BootstrapStatusResponse =
  | { state: 'configured'; instance: ConfiguredChurchInstance }
  | {
      state: 'unconfigured'
      authenticated: boolean
      eligible: boolean
      ownerConfigured: boolean
    }

export interface BootstrapResponse {
  state: 'configured'
  instance: ConfiguredChurchInstance & { id: string }
}

export interface CourseDetailResponse {
  course: Course
  lessons: Lesson[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId?: string
  }
}
