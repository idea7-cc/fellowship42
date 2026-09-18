import { useState, type FormEvent } from 'react'
import { Pencil, Plus, UserCheck, UserMinus, UserX, X } from 'lucide-react'

import { EnrollmentLink } from './enrollment-link'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type { TeamMember, TeamResponse, TeamRole } from '@/lib/api-types'
import { formatTimestamp } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  CheckboxField,
  Field,
  FieldGrid,
  FormActions,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SkeletonTable } from '@/components/ui/skeleton'
import {
  Table,
  TableActions,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableMeta,
  TableRow,
} from '@/components/ui/table'

const accessHint =
  'An owner can create a private sign-in link from their team row.'

function displayStatus(member: TeamMember) {
  if (member.membershipStatus === 'suspended') return 'suspended'
  return member.accountStatus === 'invited' ? 'invited' : 'active'
}

function memberName(member: TeamMember) {
  const name = `${member.firstName} ${member.lastName}`.trim()
  return name.length > 0 ? name : member.email
}

function selectedRoleKeys(form: FormData) {
  return form.getAll('roleKeys').map(String)
}

/**
 * Who can sign in to this instance and what they may do.
 *
 * Until this existed the bootstrapped owner was the only account that could
 * ever hold a membership, which made every deployment a single-user app.
 */
export function TeamMembersPanel({
  churchId,
  currentUserId,
  canEnroll = false,
}: {
  churchId: string
  currentUserId?: string
  canEnroll?: boolean
}) {
  const base = `/api/team/${encodeURIComponent(churchId)}`
  const teamQuery = useApiQuery<TeamResponse>(base)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const members = teamQuery.data?.members ?? []
  const roles = teamQuery.data?.roles ?? []

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await teamQuery.refetch()
      if (success) setNotice(success)
      return true
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The team could not be updated.',
      )
      if (caught instanceof ApiError && caught.status === 409) {
        await teamQuery.refetch()
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const roleKeys = selectedRoleKeys(form)
    if (roleKeys.length === 0) {
      setError('Choose at least one role for the invitation.')
      return
    }
    const email = String(form.get('email') ?? '').trim()
    const saved = await run(
      () =>
        apiRequest(`${base}/invitations`, {
          method: 'POST',
          body: JSON.stringify({
            email,
            firstName: String(form.get('firstName') ?? '').trim(),
            lastName: String(form.get('lastName') ?? '').trim(),
            roleKeys,
          }),
        }),
      `Invited ${email}. ${accessHint}`,
    )
    if (saved) formElement.reset()
  }

  function setStatus(member: TeamMember, status: 'active' | 'suspended') {
    return run(
      () =>
        apiRequest(`${base}/${encodeURIComponent(member.membershipId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: member.version, status }),
        }),
      status === 'suspended'
        ? `${memberName(member)} can no longer sign in to this church.`
        : `${memberName(member)} can sign in again.`,
    )
  }

  function remove(member: TeamMember) {
    if (
      !window.confirm(
        `Remove ${memberName(member)} from the team? They keep their sign-in account but lose every role here.`,
      )
    ) {
      return
    }
    void run(
      () =>
        apiRequest(`${base}/${encodeURIComponent(member.membershipId)}`, {
          method: 'DELETE',
          body: JSON.stringify({ version: member.version }),
        }),
      `Removed ${memberName(member)} from the team.`,
    )
  }

  const editingMember = members.find(
    (member) => member.membershipId === editing,
  )

  return (
    <div className="grid gap-6">
      {error ? (
        <p
          className="rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="rounded-md bg-success-soft p-2.5 text-sm text-success-soft-foreground"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <Card elevation="raised">
        <CardHeader className="mb-4">
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            Sends nothing by itself: the person signs in with the email below
            and receives the roles you choose. {accessHint}
          </CardDescription>
        </CardHeader>
        <form className="grid gap-4" onSubmit={invite}>
          <FieldGrid>
            <Field label="Email" required>
              <Input
                autoComplete="off"
                name="email"
                placeholder="name@church.org"
                required
                type="email"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name">
                <Input autoComplete="off" name="firstName" />
              </Field>
              <Field label="Last name">
                <Input autoComplete="off" name="lastName" />
              </Field>
            </div>
          </FieldGrid>
          <RoleChoices roles={roles} />
          <FormActions>
            <Button disabled={busy || roles.length === 0} type="submit">
              <Plus />
              Invite
            </Button>
          </FormActions>
        </form>
      </Card>

      {editingMember ? (
        <RoleEditor
          key={editingMember.membershipId}
          member={editingMember}
          onCancel={() => setEditing(null)}
          onSubmit={async (roleKeys) => {
            const saved = await run(
              () =>
                apiRequest(
                  `${base}/${encodeURIComponent(editingMember.membershipId)}`,
                  {
                    method: 'PATCH',
                    body: JSON.stringify({
                      version: editingMember.version,
                      roleKeys,
                    }),
                  },
                ),
              `Updated roles for ${memberName(editingMember)}.`,
            )
            if (saved) setEditing(null)
          }}
          roles={roles}
        />
      ) : null}

      {teamQuery.isLoading && !teamQuery.data ? (
        <TableContainer>
          <SkeletonTable columns={4} rows={3} />
        </TableContainer>
      ) : teamQuery.error ? (
        <EmptyState
          description={teamQuery.error.message}
          title="The team could not be loaded"
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last seen
                </TableHead>
                <TableHead align="right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const name = memberName(member)
                const isSelf = member.userId === currentUserId
                const suspended = member.membershipStatus === 'suspended'
                return (
                  <TableRow className="group/row" key={member.membershipId}>
                    <TableCell className="max-w-[14rem] sm:max-w-xs">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={name} size="default" />
                        <div className="min-w-0">
                          <span className="block truncate font-medium">
                            {name}
                            {isSelf ? (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                (you)
                              </span>
                            ) : null}
                          </span>
                          <TableMeta className="block truncate">
                            {member.email}
                          </TableMeta>
                          <div className="mt-1 sm:hidden">
                            <StatusBadge
                              size="sm"
                              status={displayStatus(member)}
                            />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {member.roleKeys.map((key) => (
                          <Badge
                            key={key}
                            size="sm"
                            variant={key === 'owner' ? 'brand' : 'outline'}
                          >
                            {roles.find((role) => role.key === key)?.name ??
                              key}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge status={displayStatus(member)} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {member.lastSeenAt ? (
                        formatTimestamp(member.lastSeenAt)
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <TableActions>
                        {canEnroll &&
                          !suspended &&
                          member.accountStatus === 'invited' && (
                            <EnrollmentLink
                              key={`${churchId}:${member.membershipId}:${member.version}`}
                              churchId={churchId}
                              membershipId={member.membershipId}
                              version={member.version}
                              name={name}
                            />
                          )}
                        <Button
                          aria-label={`Edit roles for ${name}`}
                          disabled={busy}
                          onClick={() => setEditing(member.membershipId)}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          aria-label={
                            suspended ? `Reinstate ${name}` : `Suspend ${name}`
                          }
                          disabled={busy}
                          onClick={() =>
                            void setStatus(
                              member,
                              suspended ? 'active' : 'suspended',
                            )
                          }
                          size="icon-xs"
                          variant="ghost"
                        >
                          {suspended ? <UserCheck /> : <UserX />}
                        </Button>
                        <Button
                          aria-label={`Remove ${name} from the team`}
                          disabled={busy}
                          onClick={() => remove(member)}
                          size="icon-xs"
                          variant="destructive-ghost"
                        >
                          <UserMinus />
                        </Button>
                      </TableActions>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}

function RoleChoices({
  defaultKeys = [],
  roles,
}: {
  defaultKeys?: string[]
  roles: TeamRole[]
}) {
  return (
    <fieldset className="grid gap-1 sm:grid-cols-2">
      <legend className="mb-1 text-[0.8125rem] leading-none font-medium text-foreground">
        Roles
      </legend>
      {roles.map((role) => (
        <CheckboxField
          defaultChecked={defaultKeys.includes(role.key)}
          hint={role.description}
          key={role.key}
          label={role.name}
          name="roleKeys"
          value={role.key}
        />
      ))}
    </fieldset>
  )
}

function RoleEditor({
  member,
  onCancel,
  onSubmit,
  roles,
}: {
  member: TeamMember
  onCancel: () => void
  onSubmit: (roleKeys: string[]) => Promise<void>
  roles: TeamRole[]
}) {
  const [localError, setLocalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <Card elevation="raised">
      <CardHeader className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Roles — {memberName(member)}</CardTitle>
            <CardDescription>
              Changes apply the next time this person loads a page.
            </CardDescription>
          </div>
          <Button
            aria-label="Close role editor"
            onClick={onCancel}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </CardHeader>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const roleKeys = selectedRoleKeys(new FormData(event.currentTarget))
          if (roleKeys.length === 0) {
            setLocalError(
              'Choose at least one role, or remove the person from the team instead.',
            )
            return
          }
          setLocalError(null)
          setSaving(true)
          try {
            await onSubmit(roleKeys)
          } finally {
            setSaving(false)
          }
        }}
      >
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}
        <RoleChoices defaultKeys={member.roleKeys} roles={roles} />
        <FormActions>
          <Button disabled={saving} type="submit">
            Save roles
          </Button>
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
        </FormActions>
      </form>
    </Card>
  )
}
