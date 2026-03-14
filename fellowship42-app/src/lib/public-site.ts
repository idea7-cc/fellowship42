import { cache } from 'react'

import { getPayloadClient } from '@/lib/getPayloadClient'

const churchDepth = 1

export const getPublishedChurches = cache(async () => {
  const payload = await getPayloadClient()

  return payload.find({
    collection: 'churches',
    depth: 1,
    limit: 6,
    overrideAccess: false,
    sort: 'name',
    where: {
      status: {
        equals: 'published',
      },
    },
  })
})

export const getChurchSiteData = cache(async (slug: string) => {
  const payload = await getPayloadClient()
  const churches = await payload.find({
    collection: 'churches',
    depth: churchDepth,
    limit: 1,
    overrideAccess: false,
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
        {
          status: {
            equals: 'published',
          },
        },
      ],
    },
  })

  const church = churches.docs[0]

  if (!church) {
    return null
  }

  const [ministries, groups, courses, events, sermons] = await Promise.all([
    payload.find({
      collection: 'ministries',
      depth: 0,
      limit: 3,
      overrideAccess: false,
      sort: '-featured,title',
      where: {
        church: {
          equals: church.id,
        },
      },
    }),
    payload.find({
      collection: 'groups',
      depth: 1,
      limit: 4,
      overrideAccess: false,
      sort: '-featured,title',
      where: {
        church: {
          equals: church.id,
        },
      },
    }),
    payload.find({
      collection: 'courses',
      depth: 0,
      limit: 3,
      overrideAccess: false,
      sort: '-featured,title',
      where: {
        church: {
          equals: church.id,
        },
      },
    }),
    payload.find({
      collection: 'events',
      depth: 0,
      limit: 4,
      overrideAccess: false,
      sort: 'startDate',
      where: {
        church: {
          equals: church.id,
        },
      },
    }),
    payload.find({
      collection: 'sermons',
      depth: 0,
      limit: 2,
      overrideAccess: false,
      sort: '-preachedAt',
      where: {
        church: {
          equals: church.id,
        },
      },
    }),
  ])

  return {
    church,
    courses: courses.docs,
    events: events.docs,
    groups: groups.docs,
    ministries: ministries.docs,
    sermons: sermons.docs,
  }
})
