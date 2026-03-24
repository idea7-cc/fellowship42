import { cache } from 'react'

import { getPayloadClient } from '@/lib/getPayloadClient'
import {
  buildLandingPagePath,
  landingPageOwnerConfig,
  type LandingPageOwnerCollection,
  type LandingPageType,
} from '@/lib/landing-page-urls'
import { resolveTheme, type ChurchThemeInput } from '@/brand'

type EntityCollection = LandingPageOwnerCollection
type EntityDoc = Record<string, unknown> & {
  church?: number | string | Record<string, unknown> | null
  id: number | string
  lessons?: Array<Record<string, unknown>> | null
  ministry?: number | string | Record<string, unknown> | null
  slug?: string | null
  summary?: string | null
  title?: string | null
}

type ChurchDoc = Record<string, unknown> & {
  givingUrl?: string | null
  id: number | string
  slug: string
  theme?: Record<string, unknown> | null
}

type LandingPageDoc = Record<string, unknown> & {
  blocks?: Array<Record<string, unknown>> | null
  church?: number | string | Record<string, unknown> | null
  course?: number | string | Record<string, unknown> | null
  group?: number | string | Record<string, unknown> | null
  id: number | string
  ministry?: number | string | Record<string, unknown> | null
  pageType?: LandingPageType | null
  seoDescription?: string | null
  status?: string | null
  themeMode?: 'custom' | 'inherit' | null
  themeOverrides?: Record<string, unknown> | null
}

type LandingPageContext = {
  church: ChurchDoc
  entity: EntityDoc
  landingPage: LandingPageDoc | null
  pageType: LandingPageType
  publicPath: string
  relatedCourses: EntityDoc[]
  relatedGroups: EntityDoc[]
  themeInput: ChurchThemeInput
}

const readArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const getRelationshipID = (value: unknown): number | string | null => {
  if (!value) {
    return null
  }

  if (typeof value === 'object') {
    return 'id' in value && value.id ? (value.id as number | string) : null
  }

  return value as number | string
}

const getChurchBySlug = async (churchSlug: string, includeDraft = false): Promise<ChurchDoc | null> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'churches',
    depth: 1,
    limit: 1,
    overrideAccess: includeDraft,
    where: {
      and: [
        {
          slug: {
            equals: churchSlug,
          },
        },
        ...(includeDraft
          ? []
          : [
              {
                status: {
                  equals: 'published',
                },
              },
            ]),
      ],
    },
  })

  return (result.docs[0] as unknown as ChurchDoc | undefined) ?? null
}

const getChurchByID = async (churchID: number | string, includeDraft = false): Promise<ChurchDoc | null> => {
  const payload = await getPayloadClient()
  const result = await payload.findByID({
    collection: 'churches',
    depth: 1,
    id: churchID,
    overrideAccess: includeDraft,
  })

  return (result as unknown as ChurchDoc | null) ?? null
}

const getOwnerBySlug = async ({
  churchID,
  collection,
  includeDraft = false,
  slug,
}: {
  churchID: number | string
  collection: EntityCollection
  includeDraft?: boolean
  slug: string
}): Promise<EntityDoc | null> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection,
    depth: 2,
    limit: 1,
    overrideAccess: includeDraft,
    where: {
      and: [
        {
          church: {
            equals: churchID,
          },
        },
        {
          slug: {
            equals: slug,
          },
        },
      ],
    },
  })

  return (result.docs[0] as unknown as EntityDoc | undefined) ?? null
}

const getOwnerByID = async ({
  collection,
  id,
  includeDraft = false,
}: {
  collection: EntityCollection
  id: number | string
  includeDraft?: boolean
}): Promise<EntityDoc | null> => {
  const payload = await getPayloadClient()
  const result = await payload.findByID({
    collection,
    depth: 2,
    id,
    overrideAccess: includeDraft,
  })

  return (result as unknown as EntityDoc | null) ?? null
}

const getLandingPageByID = async (id: number | string, includeDraft = false): Promise<LandingPageDoc | null> => {
  const payload = await getPayloadClient()
  const result = await payload.findByID({
    collection: 'landing-pages',
    depth: 2,
    id,
    overrideAccess: includeDraft,
  })

  return (result as unknown as LandingPageDoc | null) ?? null
}

const getLandingPageForOwner = async ({
  churchID,
  includeDraft = false,
  ownerCollection,
  ownerID,
}: {
  churchID: number | string
  includeDraft?: boolean
  ownerCollection: EntityCollection
  ownerID: number | string
}): Promise<LandingPageDoc | null> => {
  const payload = await getPayloadClient()
  const relationField = landingPageOwnerConfig[ownerCollection].relationField
  const result = await payload.find({
    collection: 'landing-pages',
    depth: 2,
    limit: 1,
    overrideAccess: includeDraft,
    where: {
      and: [
        {
          church: {
            equals: churchID,
          },
        },
        {
          [relationField]: {
            equals: ownerID,
          },
        },
        ...(includeDraft
          ? []
          : [
              {
                status: {
                  equals: 'published',
                },
              },
            ]),
      ],
    },
  })

  return (result.docs[0] as unknown as LandingPageDoc | undefined) ?? null
}

const getMinistryIDForContext = ({ entity, ownerCollection }: { entity: EntityDoc; ownerCollection: EntityCollection }) => {
  if (ownerCollection === 'ministries') {
    return entity.id
  }

  return getRelationshipID(entity.ministry)
}

const resolveFeedItems = async ({
  block,
  churchID,
  currentEntityID,
  ownerCollection,
  ministryID,
}: {
  block: Record<string, unknown>
  churchID: number | string
  currentEntityID: number | string
  ownerCollection: EntityCollection
  ministryID: number | string | null
}) => {
  const payload = await getPayloadClient()
  const feedType = String(block.feedType || '')
  const limit = typeof block.limit === 'number' ? Math.max(1, Math.min(block.limit, 6)) : 3
  const scope = block.scope === 'ministry' ? 'ministry' : 'church'

  if (feedType === 'groups' || feedType === 'courses') {
    const shouldExcludeCurrent = feedType === ownerCollection
    const docs = await payload.find({
      collection: feedType,
      depth: 2,
      limit,
      overrideAccess: false,
      sort: 'title',
      where: {
        and: [
          {
            church: {
              equals: churchID,
            },
          },
          ...(scope === 'ministry' && ministryID
            ? [
                {
                  ministry: {
                    equals: ministryID,
                  },
                },
              ]
            : []),
          ...(shouldExcludeCurrent
            ? [
                {
                  id: {
                    not_equals: currentEntityID,
                  },
                },
              ]
            : []),
        ],
      },
    })

    return docs.docs
  }

  if (feedType === 'events') {
    const docs = await payload.find({
      collection: 'events',
      depth: 1,
      limit,
      overrideAccess: false,
      sort: '-startDate',
      where: {
        church: {
          equals: churchID,
        },
      },
    })

    return docs.docs
  }

  if (feedType === 'sermons') {
    const docs = await payload.find({
      collection: 'sermons',
      depth: 1,
      limit,
      overrideAccess: false,
      sort: '-preachedAt',
      where: {
        church: {
          equals: churchID,
        },
      },
    })

    return docs.docs
  }

  return []
}

const resolveLeaderPeople = async ({
  churchID,
  ids,
}: {
  churchID: number | string
  ids: Array<number | string>
}) => {
  if (!ids.length) {
    return []
  }

  const payload = await getPayloadClient()
  const people = await payload.find({
    collection: 'people',
    depth: 1,
    limit: ids.length,
    overrideAccess: true,
    where: {
      and: [
        {
          church: {
            equals: churchID,
          },
        },
        {
          id: {
            in: ids,
          },
        },
      ],
    },
  })

  return people.docs
}

const enrichBlocks = async ({
  blocks,
  churchID,
  entity,
  ownerCollection,
}: {
  blocks?: Array<Record<string, unknown>> | null
  churchID: number | string
  entity: EntityDoc
  ownerCollection: EntityCollection
}) => {
  if (!blocks?.length) {
    return blocks ?? []
  }

  const ministryID = getMinistryIDForContext({ entity, ownerCollection })

  return Promise.all(
    blocks.map(async (block) => {
      if (block.blockType === 'leaderCards') {
        const leaderIDs = readArray<unknown>(block.leaders)
          .map((leader) => getRelationshipID(leader))
          .filter((leaderID): leaderID is number | string => Boolean(leaderID))

        return {
          ...block,
          leaders: await resolveLeaderPeople({
            churchID,
            ids: leaderIDs,
          }),
        }
      }

      if (block.blockType !== 'relatedFeed') {
        return block
      }

      return {
        ...block,
        resolvedItems: await resolveFeedItems({
          block,
          churchID,
          currentEntityID: entity.id,
          ownerCollection,
          ministryID,
        }),
      }
    }),
  )
}

const buildLandingPageContext = async ({
  church,
  entity,
  landingPage,
  ownerCollection,
}: {
  church: ChurchDoc
  entity: EntityDoc
  landingPage: LandingPageDoc | null
  ownerCollection: EntityCollection
}): Promise<LandingPageContext> => {
  const payload = await getPayloadClient()
  const pageType = landingPageOwnerConfig[ownerCollection].pageType
  const [relatedGroups, relatedCourses, enrichedBlocks] = await Promise.all([
    ownerCollection === 'ministries'
      ? payload.find({
          collection: 'groups',
          depth: 1,
          limit: 6,
          overrideAccess: false,
          where: {
            ministry: {
              equals: entity.id,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    ownerCollection === 'ministries'
      ? payload.find({
          collection: 'courses',
          depth: 1,
          limit: 6,
          overrideAccess: false,
          where: {
            ministry: {
              equals: entity.id,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    enrichBlocks({
      blocks: landingPage?.blocks,
      churchID: church.id,
      entity,
      ownerCollection,
    }),
  ])

  const resolvedLandingPage = landingPage
    ? ({
        ...landingPage,
        blocks: enrichedBlocks,
      } satisfies LandingPageDoc)
    : null

  return {
    church,
    entity,
    landingPage: resolvedLandingPage,
    pageType,
    publicPath: buildLandingPagePath({
      churchSlug: church.slug,
      ownerCollection,
      ownerSlug: String(entity.slug || ''),
    }),
    relatedCourses: relatedCourses.docs as EntityDoc[],
    relatedGroups: relatedGroups.docs as EntityDoc[],
    themeInput: {
      ...(church.theme as ChurchThemeInput),
      ...(resolvedLandingPage?.themeMode === 'custom'
        ? (resolvedLandingPage.themeOverrides as ChurchThemeInput)
        : {}),
    },
  }
}

export const getLandingPageDataByOwnerSlug = async ({
  churchSlug,
  includeDraft = false,
  ownerCollection,
  ownerSlug,
}: {
  churchSlug: string
  includeDraft?: boolean
  ownerCollection: EntityCollection
  ownerSlug: string
}) => {
  const church = await getChurchBySlug(churchSlug, includeDraft)
  if (!church) {
    return null
  }

  const entity = await getOwnerBySlug({
    churchID: church.id,
    collection: ownerCollection,
    includeDraft,
    slug: ownerSlug,
  })

  if (!entity) {
    return null
  }

  const landingPage = await getLandingPageForOwner({
    churchID: church.id,
    includeDraft,
    ownerCollection,
    ownerID: entity.id,
  })

  return buildLandingPageContext({
    church,
    entity,
    landingPage,
    ownerCollection,
  })
}

export const getLandingPageDataByOwnerID = async ({
  includeDraft = false,
  ownerCollection,
  ownerID,
}: {
  includeDraft?: boolean
  ownerCollection: EntityCollection
  ownerID: number | string
}) => {
  const entity = await getOwnerByID({
    collection: ownerCollection,
    id: ownerID,
    includeDraft,
  })

  if (!entity) {
    return null
  }

  const churchID = getRelationshipID(entity.church)
  if (!churchID) {
    return null
  }

  const church = await getChurchByID(churchID, includeDraft)
  if (!church) {
    return null
  }

  const landingPage = await getLandingPageForOwner({
    churchID,
    includeDraft,
    ownerCollection,
    ownerID,
  })

  return buildLandingPageContext({
    church,
    entity,
    landingPage,
    ownerCollection,
  })
}

export const getLandingPageDataByPageID = async ({
  includeDraft = false,
  pageID,
}: {
  includeDraft?: boolean
  pageID: number | string
}) => {
  const landingPage = await getLandingPageByID(pageID, includeDraft)
  if (!landingPage) {
    return null
  }

  const ownerCollection =
    landingPage.pageType === 'group' ? 'groups' : landingPage.pageType === 'course' ? 'courses' : 'ministries'
  const relationField = landingPageOwnerConfig[ownerCollection].relationField
  const ownerID = getRelationshipID(landingPage[relationField])
  const churchID = getRelationshipID(landingPage.church)

  if (!ownerID || !churchID) {
    return null
  }

  const [church, entity] = await Promise.all([
    getChurchByID(churchID, includeDraft),
    getOwnerByID({
      collection: ownerCollection,
      id: ownerID,
      includeDraft,
    }),
  ])

  if (!church || !entity) {
    return null
  }

  return buildLandingPageContext({
    church,
    entity,
    landingPage,
    ownerCollection,
  })
}

export const getMinistryLandingPageData = cache(async (churchSlug: string, ministrySlug: string) =>
  getLandingPageDataByOwnerSlug({
    churchSlug,
    ownerCollection: 'ministries',
    ownerSlug: ministrySlug,
  }),
)

export const getGroupLandingPageData = cache(async (churchSlug: string, groupSlug: string) =>
  getLandingPageDataByOwnerSlug({
    churchSlug,
    ownerCollection: 'groups',
    ownerSlug: groupSlug,
  }),
)

export const getCourseLandingPageData = cache(async (churchSlug: string, courseSlug: string) =>
  getLandingPageDataByOwnerSlug({
    churchSlug,
    ownerCollection: 'courses',
    ownerSlug: courseSlug,
  }),
)
