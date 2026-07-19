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
  enrollmentPolicy: 'closed' | 'request' | 'open'
  openEnrollment: boolean
  capacity?: number
  featured: boolean
  summary: string
  version: number
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
  version: number
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  summary: string
  estimatedMinutes?: number
  required: boolean
  sortOrder: number
  content?: string
  mediaId?: string
  version: number
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
  timezone: string
  location: string
  registrationUrl?: string
  featured: boolean
  capacity?: number
  version: number
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
  audioMediaId?: string
  preachedAt: number
  featured: boolean
  version: number
}

export interface MediaRecord {
  id: string
  churchId: string
  mediaType: string
  contentType: string
  byteSize: number
  checksum?: string
  altText: string
  visibility: 'public' | 'private'
  createdAt: number
  version: number
  url?: string
}

export interface Contribution {
  id: string
  churchId: string
  personId?: string
  donorName: string
  amountMinor: number
  currency: string
  fund: string
  paymentMethod: string
  status: 'pending' | 'succeeded' | 'refunded' | 'failed'
  recurring: boolean
  provider?: string
  providerPaymentId?: string
  donatedAt: number
  createdAt: number
  updatedAt: number
  version: number
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
  version: number
}

export interface PersonDetail extends Person {
  notes?: string
}

export interface HouseholdMember {
  personId: string
  firstName: string
  lastName: string
  relationship: 'spouse' | 'child' | 'parent' | 'guardian' | 'other'
  isPrimary: boolean
}

export interface Household {
  id: string
  churchId: string
  name: string
  address: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    countryCode: string
  }
  members: HouseholdMember[]
  version: number
}

export interface CursorPage {
  limit: number
  nextCursor: string | null
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

export type ManagementCapability =
  | 'instance.status.read'
  | 'backup.export'
  | 'update.prepare'
  | 'update.apply'
  | 'support.session.request'
  | 'management.disconnect'

export interface ManagementOperatorSummary {
  id: string
  displayName: string
  keyId: string
  keyFingerprint: string
  syncUrl?: string
}

export interface ManagementGrantSummary {
  capability: ManagementCapability
  grantedAt: string
  expiresAt: string
  requiresLocalApproval: boolean
}

export interface ManagementStatusResponse {
  instanceId: string
  enabled: boolean
  identity: { keyId: string; fingerprint: string } | null
  pendingEnrollment: {
    challengeId: string
    operator: ManagementOperatorSummary & { syncUrl: string }
    requestedCapabilities: ManagementCapability[]
    submittedAt: string
  } | null
  connection: {
    connectionId: string
    operator: ManagementOperatorSummary
    grantVersion: number
    rotationPending: boolean
    grants: ManagementGrantSummary[]
    approvedAt: string
    lastSyncAt: string | null
    lastSyncStatus: string | null
    lastSyncCode: string | null
  } | null
}

export interface EnrollmentChallenge {
  protocolVersion: '1'
  challengeId: string
  instanceId: string
  instanceKey: {
    kty: 'OKP'
    crv: 'Ed25519'
    x: string
    kid: string
    use: 'sig'
    alg: 'EdDSA'
  }
  oneTimeCode: string
  issuedAt: string
  expiresAt: string
}
