import { Navigate, Routes, Route, useParams } from 'react-router-dom'

import { AppShell } from './components/app-shell'
import { OverviewPage } from './routes/overview'
import { PeoplePage } from './routes/people'
import { GroupsPage } from './routes/groups'
import { CoursesPage } from './routes/courses'
import { CourseDetailPage } from './routes/course-detail'
import { EventsPage } from './routes/events'
import { MediaPage } from './routes/media'
import { SermonsPage } from './routes/sermons'
import { ContributionsPage } from './routes/contributions'
import { ManagementPage } from './routes/management'
import { NotFoundPage } from './routes/not-found'

/**
 * One deployment is one church, so the church is not in the URL.
 *
 * Routes were `/churches/:churchId/...`, which made a single-church product
 * navigate like a tenant selector: "Church" opened a list of one, and opening
 * that led to another view of the same church. The church now comes from
 * context (see `lib/church-context.tsx`) and the paths are flat.
 */
export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:slug" element={<CourseDetailPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/sermons" element={<SermonsPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/contributions" element={<ContributionsPage />} />
        <Route path="/management" element={<ManagementPage />} />

        {/* Keep older church-scoped links working rather than 404ing them. */}
        <Route path="/churches" element={<Navigate replace to="/" />} />
        <Route
          path="/churches/:churchId"
          element={<Navigate replace to="/" />}
        />
        <Route
          path="/churches/:churchId/*"
          element={<LegacyChurchRedirect />}
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}

/** Maps `/churches/:churchId/people` to `/people`, preserving the tail. */
function LegacyChurchRedirect() {
  const params = useParams()
  return <Navigate replace to={`/${params['*'] ?? ''}`} />
}
