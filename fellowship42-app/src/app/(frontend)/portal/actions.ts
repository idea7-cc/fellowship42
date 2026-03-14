'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getPayloadClient } from '@/lib/getPayloadClient'
import { getCourseForUser, getPortalDashboard } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

const userPersonID = (user: Awaited<ReturnType<typeof requireSessionUser>>) => {
  if (!user.person) {
    return null
  }

  return typeof user.person === 'object' ? user.person.id ?? null : user.person
}

const userChurchID = (user: Awaited<ReturnType<typeof requireSessionUser>>) => {
  const church = user.churches?.[0]

  if (!church) {
    return null
  }

  return typeof church === 'object' ? church.id ?? null : church
}

export const joinGroupAction = async (formData: FormData) => {
  const user = await requireSessionUser()
  const payload = await getPayloadClient()
  const personID = userPersonID(user)
  const churchID = userChurchID(user)
  const groupID = formData.get('groupID')

  if (!personID || !churchID || typeof groupID !== 'string') {
    redirect('/portal')
  }

  const groupRelationID = Number(groupID)

  if (Number.isNaN(groupRelationID)) {
    redirect('/portal')
  }

  const existingMembership = await payload.find({
    collection: 'group-memberships',
    limit: 1,
    where: {
      and: [
        {
          group: {
            equals: groupRelationID,
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

  if (!existingMembership.docs[0]) {
    await payload.create({
      collection: 'group-memberships',
      data: {
        church: churchID,
        group: groupRelationID,
        joinedAt: new Date().toISOString(),
        person: personID,
        role: 'member',
        status: 'active',
      },
    })
  }

  revalidatePath('/portal')
  redirect('/portal')
}

export const startCourseAction = async (formData: FormData) => {
  const user = await requireSessionUser()
  const payload = await getPayloadClient()
  const personID = userPersonID(user)
  const churchID = userChurchID(user)
  const courseID = formData.get('courseID')
  const courseSlug = formData.get('courseSlug')

  if (!personID || !churchID || typeof courseID !== 'string' || typeof courseSlug !== 'string') {
    redirect('/portal')
  }

  const courseRelationID = Number(courseID)

  if (Number.isNaN(courseRelationID)) {
    redirect('/portal')
  }

  const existingEnrollment = await payload.find({
    collection: 'course-enrollments',
    limit: 1,
    where: {
      and: [
        {
          course: {
            equals: courseRelationID,
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

  if (!existingEnrollment.docs[0]) {
    await payload.create({
      collection: 'course-enrollments',
      data: {
        church: churchID,
        completedLessons: [],
        course: courseRelationID,
        person: personID,
        progressPercent: 0,
        startedAt: new Date().toISOString(),
        status: 'active',
      },
    })
  }

  revalidatePath('/portal')
  redirect(`/portal/courses/${courseSlug}`)
}

export const toggleLessonCompletionAction = async (formData: FormData) => {
  const user = await requireSessionUser()
  const payload = await getPayloadClient()
  const slug = formData.get('courseSlug')
  const lessonID = formData.get('lessonID')
  const lessonTitle = formData.get('lessonTitle')

  if (typeof slug !== 'string' || typeof lessonID !== 'string' || typeof lessonTitle !== 'string') {
    redirect('/portal')
  }

  const courseData = await getCourseForUser(user, slug)

  if (!courseData?.enrollment) {
    redirect(`/portal/courses/${slug}`)
  }

  const completedLessons = courseData.enrollment.completedLessons ?? []
  const alreadyCompleted = completedLessons.some((lesson) => lesson.lessonID === lessonID)
  const nextLessons = alreadyCompleted
    ? completedLessons.filter((lesson) => lesson.lessonID !== lessonID)
    : [
        ...completedLessons,
        {
          completedAt: new Date().toISOString(),
          lessonID,
          title: lessonTitle,
        },
      ]

  const totalLessons = courseData.course.lessons?.length ?? 0
  const progressPercent = totalLessons ? Math.round((nextLessons.length / totalLessons) * 100) : 0

  await payload.update({
    collection: 'course-enrollments',
    id: courseData.enrollment.id,
    data: {
      completedAt: progressPercent === 100 ? new Date().toISOString() : null,
      completedLessons: nextLessons,
      progressPercent,
      status: progressPercent === 100 ? 'completed' : 'active',
    },
  })

  revalidatePath('/portal')
  revalidatePath(`/portal/courses/${slug}`)
  redirect(`/portal/courses/${slug}`)
}

export const refreshPortalAction = async () => {
  const user = await requireSessionUser()
  await getPortalDashboard(user)
  revalidatePath('/portal')
}
