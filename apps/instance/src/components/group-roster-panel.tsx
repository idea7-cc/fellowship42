import { useState, type FormEvent } from 'react'
import { Plus, UserMinus, X } from 'lucide-react'

import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type {
  Group,
  GroupLeaderRole,
  GroupMembershipStatus,
  GroupRoster,
  Person,
} from '@/lib/api-types'
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
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const membershipStatuses: Array<{
  value: GroupMembershipStatus
  label: string
}> = [
  { value: 'interested', label: 'Interested' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
]

const leaderRoles: Array<{ value: GroupLeaderRole; label: string }> = [
  { value: 'leader', label: 'Leader' },
  { value: 'apprentice', label: 'Apprentice' },
  { value: 'host', label: 'Host' },
]

/**
 * Roster management for one group.
 *
 * Until this existed a church could publish a group but never put anyone in
 * it, which made groups a brochure rather than a workflow.
 */
export function GroupRosterPanel({
  churchId,
  group,
  onClose,
}: {
  churchId: string
  group: Group
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rosterQuery = useApiQuery<GroupRoster>(
    `/api/groups/${encodeURIComponent(churchId)}/${encodeURIComponent(group.id)}/roster`,
  )
  const peopleQuery = useApiQuery<{ people: Person[] }>(
    `/api/people/${encodeURIComponent(churchId)}?limit=100`,
  )

  const roster = rosterQuery.data
  const people = peopleQuery.data?.people ?? []
  const base = `/api/groups/${encodeURIComponent(churchId)}/${encodeURIComponent(group.id)}`

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await rosterQuery.refetch()
      return true
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The roster could not be updated.',
      )
      if (caught instanceof ApiError && caught.status === 409) {
        await rosterQuery.refetch()
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const personId = String(form.get('personId') ?? '')
    if (!personId) return
    const status = String(form.get('status') ?? 'active')
    const saved = await run(() =>
      apiRequest(`${base}/members/${encodeURIComponent(personId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          version:
            roster?.members.find((member) => member.personId === personId)
              ?.version ?? 0,
        }),
      }),
    )
    if (saved) formElement.reset()
  }

  async function addLeader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const personId = String(form.get('personId') ?? '')
    if (!personId) return
    const role = String(form.get('role') ?? 'leader')
    const saved = await run(() =>
      apiRequest(`${base}/leaders/${encodeURIComponent(personId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          role,
          version:
            roster?.leaders.find((leader) => leader.personId === personId)
              ?.version ?? 0,
        }),
      }),
    )
    if (saved) formElement.reset()
  }

  const atCapacity =
    roster?.capacity !== undefined && roster.activeCount >= roster.capacity

  return (
    <Card className="mb-4" elevation="raised">
      <CardHeader className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Roster — {group.title}</CardTitle>
            <CardDescription>
              {roster
                ? roster.capacity !== undefined
                  ? `${roster.activeCount} of ${roster.capacity} active`
                  : `${roster.activeCount} active`
                : 'Loading roster…'}
              {roster?.leaders.length
                ? ` · ${roster.leaders.length} ${roster.leaders.length === 1 ? 'leader' : 'leaders'}`
                : null}
            </CardDescription>
          </div>
          <Button
            aria-label="Close roster"
            onClick={onClose}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </CardHeader>

      {error ? (
        <p
          className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {atCapacity ? (
        <p className="mb-3 rounded-md bg-warning-soft p-2.5 text-sm text-warning-soft-foreground">
          This group is at capacity. New people can still be added as interested
          or pending.
        </p>
      ) : null}

      {rosterQuery.isLoading && !rosterQuery.data ? (
        <div className="grid gap-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : (
        <div className="grid gap-6">
          {/* ── Leaders ─────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
              Leaders
            </h3>
            {roster?.leaders.length ? (
              <ul className="mb-3 grid gap-1.5">
                {roster.leaders.map((leader) => {
                  const name = `${leader.firstName} ${leader.lastName}`
                  return (
                    <li
                      className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                      key={leader.personId}
                    >
                      <Avatar name={name} size="sm" />
                      <span className="text-sm font-medium">{name}</span>
                      <Badge size="sm" variant="brand">
                        {leaderRoles.find((role) => role.value === leader.role)
                          ?.label ?? leader.role}
                      </Badge>
                      <Button
                        aria-label={`Remove ${name} as leader`}
                        className="ml-auto"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            apiRequest(
                              `${base}/leaders/${encodeURIComponent(leader.personId)}`,
                              {
                                method: 'DELETE',
                                body: JSON.stringify({
                                  version: leader.version,
                                }),
                              },
                            ),
                          )
                        }
                        size="icon-xs"
                        variant="destructive-ghost"
                      >
                        <UserMinus />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">
                No leaders assigned yet.
              </p>
            )}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={addLeader}
            >
              <Field className="min-w-48 flex-1" label="Add leader">
                <Select
                  defaultValue=""
                  name="personId"
                  required
                  selectSize="sm"
                >
                  <option disabled value="">
                    Select a person
                  </option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="w-36" label="Role">
                <Select defaultValue="leader" name="role" selectSize="sm">
                  {leaderRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                disabled={busy}
                size="sm"
                type="submit"
                variant="secondary"
              >
                <Plus />
                Add
              </Button>
            </form>
          </section>

          {/* ── Members ─────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
              Members
            </h3>
            {roster?.members.length ? (
              <ul className="mb-3 grid gap-1.5">
                {roster.members.map((member) => {
                  const name = `${member.firstName} ${member.lastName}`
                  return (
                    <li
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                      key={member.personId}
                    >
                      <Avatar name={name} size="sm" />
                      <span className="text-sm font-medium">{name}</span>
                      <StatusBadge size="sm" status={member.status} />
                      {member.notes ? (
                        <span className="text-xs text-muted-foreground">
                          {member.notes}
                        </span>
                      ) : null}
                      <div className="ml-auto flex items-center gap-1.5">
                        <label
                          className="sr-only"
                          htmlFor={`status-${member.personId}`}
                        >
                          Status for {name}
                        </label>
                        <Select
                          containerClassName="w-36"
                          disabled={busy}
                          id={`status-${member.personId}`}
                          onChange={(event) =>
                            void run(() =>
                              apiRequest(
                                `${base}/members/${encodeURIComponent(member.personId)}`,
                                {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    status: event.target.value,
                                    version: member.version,
                                    notes: member.notes ?? null,
                                  }),
                                },
                              ),
                            )
                          }
                          selectSize="sm"
                          value={member.status}
                        >
                          {membershipStatuses.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </Select>
                        <Button
                          aria-label={`Remove ${name} from group`}
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              apiRequest(
                                `${base}/members/${encodeURIComponent(member.personId)}`,
                                {
                                  method: 'DELETE',
                                  body: JSON.stringify({
                                    version: member.version,
                                  }),
                                },
                              ),
                            )
                          }
                          size="icon-xs"
                          variant="destructive-ghost"
                        >
                          <UserMinus />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                className="mb-3 py-8"
                description="Add people to this group to build its roster."
                title="No members yet"
              />
            )}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={addMember}
            >
              <Field className="min-w-48 flex-1" label="Add member">
                <Select
                  defaultValue=""
                  name="personId"
                  required
                  selectSize="sm"
                >
                  <option disabled value="">
                    Select a person
                  </option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="w-36" label="Status">
                <Select
                  defaultValue={atCapacity ? 'interested' : 'active'}
                  name="status"
                  selectSize="sm"
                >
                  {membershipStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button disabled={busy} size="sm" type="submit">
                <Plus />
                Add
              </Button>
            </form>
          </section>
        </div>
      )}
    </Card>
  )
}
