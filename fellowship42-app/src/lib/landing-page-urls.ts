export const landingPageOwnerConfig = {
  courses: {
    label: 'course',
    pageType: 'course',
    publicSegment: 'courses',
    relationField: 'course',
  },
  groups: {
    label: 'group',
    pageType: 'group',
    publicSegment: 'groups',
    relationField: 'group',
  },
  ministries: {
    label: 'ministry',
    pageType: 'ministry',
    publicSegment: 'ministries',
    relationField: 'ministry',
  },
} as const

export type LandingPageOwnerCollection = keyof typeof landingPageOwnerConfig
export type LandingPageType = (typeof landingPageOwnerConfig)[LandingPageOwnerCollection]['pageType']

export const isLandingPageOwnerCollection = (value: string): value is LandingPageOwnerCollection =>
  value in landingPageOwnerConfig

export const buildLandingPagePath = ({
  churchSlug,
  ownerCollection,
  ownerSlug,
}: {
  churchSlug: string
  ownerCollection: LandingPageOwnerCollection
  ownerSlug: string
}) => `/churches/${churchSlug}/${landingPageOwnerConfig[ownerCollection].publicSegment}/${ownerSlug}`

export const getAppBaseURL = () =>
  process.env.NEXT_PUBLIC_SERVER_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'
