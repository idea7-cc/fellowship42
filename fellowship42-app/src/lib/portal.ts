import { cache } from 'react'

import { formatEventDate } from '@/lib/formatters'
import { getPayloadClient } from '@/lib/getPayloadClient'

type SessionUser = Awaited<ReturnType<typeof import('./session').getSessionUser>>

const getUserChurchID = (user: SessionUser) => {
  const church = user?.churches?.[0]

  if (!church) {
    return null
  }

  if (typeof church === 'object') {
    return church.id ?? null
  }

  return church
}

const getUserPersonID = (user: SessionUser) => {
  if (!user?.person) {
    return null
  }

  if (typeof user.person === 'object') {
    return user.person.id ?? null
  }

  return user.person
}

export const getPortalDashboard = cache(async (user: SessionUser) => {
  if (!user) {
    return null
  }

  const payload = await getPayloadClient()
  const churchID = getUserChurchID(user)
  const personID = getUserPersonID(user)

  if (!churchID) {
    return null
  }

  const [church, memberships, groups, enrollments, courses] = await Promise.all([
    payload.findByID({
      collection: 'churches',
      id: churchID,
    }),
    personID
      ? payload.find({
          collection: 'group-memberships',
          depth: 2,
          limit: 12,
          where: {
            person: {
              equals: personID,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    payload.find({
      collection: 'groups',
      depth: 1,
      limit: 12,
      sort: '-featured,title',
      where: {
        church: {
          equals: churchID,
        },
      },
    }),
    personID
      ? payload.find({
          collection: 'course-enrollments',
          depth: 2,
          limit: 12,
          where: {
            person: {
              equals: personID,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    payload.find({
      collection: 'courses',
      depth: 1,
      limit: 12,
      sort: '-featured,title',
      where: {
        church: {
          equals: churchID,
        },
      },
    }),
  ])

  const membershipGroupIDs = new Set(
    memberships.docs.map((membership) =>
      typeof membership.group === 'object' && membership.group ? membership.group.id : membership.group,
    ),
  )

  const enrollmentCourseIDs = new Set(
    enrollments.docs.map((enrollment) =>
      typeof enrollment.course === 'object' && enrollment.course ? enrollment.course.id : enrollment.course,
    ),
  )

  return {
    availableCourses: courses.docs.filter((course) => !enrollmentCourseIDs.has(course.id)),
    availableGroups: groups.docs.filter((group) => !membershipGroupIDs.has(group.id)),
    church,
    enrollments: enrollments.docs,
    memberships: memberships.docs,
    personID,
    user,
  }
})

export const getCourseForUser = cache(async (user: SessionUser, slug: string) => {
  if (!user) {
    return null
  }

  const payload = await getPayloadClient()
  const churchID = getUserChurchID(user)
  const personID = getUserPersonID(user)

  if (!churchID || !personID) {
    return null
  }

  const courses = await payload.find({
    collection: 'courses',
    depth: 1,
    limit: 1,
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

  const course = courses.docs[0]

  if (!course) {
    return null
  }

  const enrollments = await payload.find({
    collection: 'course-enrollments',
    depth: 1,
    limit: 1,
    where: {
      and: [
        {
          course: {
            equals: course.id,
          },
        },
        {
          person: {
            equals: personID,
          },
        },
      ],
    },
  })

  return {
    course,
    enrollment: enrollments.docs[0] ?? null,
    personID,
  }
})

export const getLeaderDashboard = cache(async (user: SessionUser) => {
  if (!user) {
    return null
  }

  const payload = await getPayloadClient()
  const churchID = getUserChurchID(user)
  const personID = getUserPersonID(user)

  if (!churchID || !personID) {
    return null
  }

  const groups = await payload.find({
    collection: 'groups',
    depth: 2,
    limit: 12,
    sort: 'title',
    where: {
      and: [
        {
          church: {
            equals: churchID,
          },
        },
        {
          leaders: {
            in: [personID],
          },
        },
      ],
    },
  })

  const groupIDs = groups.docs.map((group) => group.id)

  const [memberships, sessions, attendance] = await Promise.all([
    groupIDs.length
      ? payload.find({
          collection: 'group-memberships',
          depth: 2,
          limit: 50,
          where: {
            group: {
              in: groupIDs,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    groupIDs.length
      ? payload.find({
          collection: 'group-sessions',
          depth: 1,
          limit: 20,
          sort: '-sessionDate',
          where: {
            group: {
              in: groupIDs,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
    groupIDs.length
      ? payload.find({
          collection: 'attendance-records',
          depth: 2,
          limit: 100,
          sort: '-checkedInAt',
          where: {
            group: {
              in: groupIDs,
            },
          },
        })
      : Promise.resolve({ docs: [] }),
  ])

  const attendanceBySession = new Map<
    number | string,
    Array<{
      personName: string
      status: string
    }>
  >()

  attendance.docs.forEach((record) => {
    const sessionID = typeof record.session === 'object' && record.session ? record.session.id : record.session
    if (!sessionID) {
      return
    }

    const person = typeof record.person === 'object' && record.person ? record.person : null
    const personName = person ? `${person.firstName} ${person.lastName}` : 'Member'

    const current = attendanceBySession.get(sessionID) ?? []
    current.push({
      personName,
      status: record.status,
    })
    attendanceBySession.set(sessionID, current)
  })

  return {
    attendanceBySession,
    groups: groups.docs.map((group) => {
      const roster = memberships.docs.filter((membership) => {
        const membershipGroupID =
          typeof membership.group === 'object' && membership.group ? membership.group.id : membership.group
        return membershipGroupID === group.id
      })

      const upcomingSessions = sessions.docs
        .filter((session) => {
          const sessionGroupID =
            typeof session.group === 'object' && session.group ? session.group.id : session.group
          return sessionGroupID === group.id
        })
        .slice(0, 2)
        .map((session) => ({
          attendanceStatus: session.attendanceStatus,
          date: formatEventDate(session.sessionDate),
          id: session.id,
          title: session.title,
        }))

      return {
        id: group.id,
        location: group.location,
        roster,
        schedule: group.schedule,
        title: group.title,
        upcomingSessions,
      }
    }),
  }
})

