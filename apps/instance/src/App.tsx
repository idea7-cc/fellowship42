import { Routes, Route } from 'react-router-dom'

import { AppShell } from './components/app-shell'
import { DashboardPage } from './routes/dashboard'
import { ChurchesPage } from './routes/churches'
import { ChurchDetailPage } from './routes/church-detail'
import { PeoplePage } from './routes/people'
import { GroupsPage } from './routes/groups'
import { CoursesPage } from './routes/courses'
import { CourseDetailPage } from './routes/course-detail'
import { EventsPage } from './routes/events'
import { MediaPage } from './routes/media'
import { SermonsPage } from './routes/sermons'
import { ContributionsPage } from './routes/contributions'
import { NotFoundPage } from './routes/not-found'

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/churches" element={<ChurchesPage />} />
        <Route path="/churches/:churchId" element={<ChurchDetailPage />} />
        <Route path="/churches/:churchId/people" element={<PeoplePage />} />
        <Route path="/churches/:churchId/groups" element={<GroupsPage />} />
        <Route path="/churches/:churchId/courses" element={<CoursesPage />} />
        <Route
          path="/churches/:churchId/courses/:slug"
          element={<CourseDetailPage />}
        />
        <Route path="/churches/:churchId/events" element={<EventsPage />} />
        <Route path="/churches/:churchId/sermons" element={<SermonsPage />} />
        <Route path="/churches/:churchId/media" element={<MediaPage />} />
        <Route
          path="/churches/:churchId/contributions"
          element={<ContributionsPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}
