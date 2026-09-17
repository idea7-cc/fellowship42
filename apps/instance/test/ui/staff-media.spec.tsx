import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/lib/auth-provider'
import { ChurchProvider } from '../../src/lib/church-context'
import { CourseDetailPage } from '../../src/routes/course-detail'
import { SermonsPage } from '../../src/routes/sermons'
import type { Course, Lesson, Sermon } from '../../contracts/api'

const course: Course = {
  id: 'course',
  churchId: 'church',
  slug: 'welcome',
  title: 'Welcome',
  status: 'published',
  courseType: 'class',
  deliveryMode: 'self-paced',
  audience: 'Everyone',
  duration: '',
  featured: false,
  certificateOffered: false,
  summary: 'Welcome course',
  lessonCount: 1,
  version: 1,
}
const lesson: Lesson = {
  id: 'lesson',
  courseId: 'course',
  title: 'First lesson',
  summary: 'Start here',
  required: true,
  sortOrder: 0,
  mediaId: 'lesson attachment',
  version: 1,
}
const sermon: Sermon = {
  id: 'sermon',
  churchId: 'church',
  slug: 'hope',
  title: 'Hope',
  status: 'published',
  speaker: 'Demo speaker',
  summary: 'A message of hope',
  audioMediaId: 'sermon audio',
  preachedAt: 1_700_000_000_000,
  featured: false,
  version: 1,
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/api/session')
        return Response.json({
          user: {
            id: 'staff',
            firstName: 'Demo',
            lastName: 'Staff',
            email: 'staff@example.test',
            memberships: [
              {
                churchId: 'church',
                churchName: 'Grace',
                roles: ['staff'],
                permissions: ['courses.write', 'sermons.write'],
              },
            ],
          },
        })
      if (path.includes('/courses/'))
        return Response.json({ course, lessons: [lesson] })
      if (path.includes('/sermons')) return Response.json({ sermons: [sermon] })
      if (path.startsWith('/api/media/')) return Response.json({ media: [] })
      return Response.json({ church: { name: 'Grace' } })
    }),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function render(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ChurchProvider
            instance={{
              churchId: 'church',
              churchName: 'Grace',
              churchSlug: 'grace',
            }}
          >
            <Routes>
              <Route path="/app/courses/:slug" element={<CourseDetailPage />} />
              <Route path="/app/sermons" element={<SermonsPage />} />
            </Routes>
          </ChurchProvider>
        </AuthProvider>
      </MemoryRouter>,
    ),
  )
}
it('opens lesson attachments through the Worker media endpoint from the staff course page', async () => {
  await render('/app/courses/welcome')
  const attachment = Array.from(container.querySelectorAll('a')).find((link) =>
    link.textContent?.includes('Open lesson media'),
  )
  expect(attachment?.getAttribute('href')).toBe('/media/lesson%20attachment')
})
it('loads sermon audio through the Worker media endpoint from the staff sermons page', async () => {
  await render('/app/sermons')
  expect(container.querySelector('audio')?.getAttribute('src')).toBe(
    '/media/sermon%20audio',
  )
})
