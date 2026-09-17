import { Routes, Route } from 'react-router-dom'

import { AuthProvider } from './lib/auth-provider'
import { StaffAccess } from './components/staff-access'
import { BootstrapGate } from './components/bootstrap-gate'
import { ChurchSettingsPage } from './routes/church-settings'
import {
  PublicSitePage,
  PublicCoursePage,
  SitePreviewPage,
} from './routes/public-site'
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
import { TeamPage } from './routes/team'
import { NotFoundPage } from './routes/not-found'

function StaffRoutes() {
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
        <Route path="/settings" element={<ChurchSettingsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/management" element={<ManagementPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicSitePage />} />
      <Route path="/courses/:slug" element={<PublicCoursePage />} />
      <Route
        path="/app/preview"
        element={
          <AuthProvider>
            <BootstrapGate>
              <StaffAccess>
                <SitePreviewPage />
              </StaffAccess>
            </BootstrapGate>
          </AuthProvider>
        }
      />
      <Route
        path="/app/*"
        element={
          <AuthProvider>
            <BootstrapGate>
              <StaffAccess>
                <StaffRoutes />
              </StaffAccess>
            </BootstrapGate>
          </AuthProvider>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
