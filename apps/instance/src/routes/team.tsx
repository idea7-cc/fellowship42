import { UserCog } from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { TeamMembersPanel } from '@/components/team-members-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { useAuthState } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'

export function TeamPage() {
  const { churchId } = useChurch()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canManage =
    permissions.includes('*') || permissions.includes('team.manage')

  return (
    <PageShell>
      <PageHeader
        description="Staff and leaders who can sign in to this instance, and what each of them may do."
        title="Team"
      />
      {canManage ? (
        <TeamMembersPanel churchId={churchId} currentUserId={user?.id} />
      ) : (
        <EmptyState
          description="Ask an owner to manage the team, or for the team.manage permission."
          icon={UserCog}
          title="No team access"
        />
      )}
    </PageShell>
  )
}
