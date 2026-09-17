import { Fragment, useEffect, useState, type FormEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  HeartHandshake,
  Home,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import { useAuthState } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type {
  Church,
  CursorPage,
  Household,
  HouseholdMember,
  Person,
  PersonDetail,
} from '@/lib/api-types'
import { PageShell } from '@/components/page-shell'
import { PageHeader, Toolbar, ToolbarSpacer } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckboxField,
  Field,
  FieldGrid,
  FormActions,
} from '@/components/ui/field'
import { Avatar } from '@/components/ui/avatar'
import { Badge, humanizeStatus, StatusBadge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Tab, Tabs } from '@/components/ui/tabs'
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

type DirectoryView = 'people' | 'households'
type PersonEditor = PersonDetail | 'new' | null
type HouseholdEditor = Household | 'new' | null

const membershipStatuses = [
  { value: 'guest', label: 'Guest' },
  { value: 'regular-attender', label: 'Regular attender' },
  { value: 'member', label: 'Member' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'inactive', label: 'Inactive' },
]

const relationships = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
]

function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function Pagination({
  page,
  hasPrevious,
  onPrevious,
  onNext,
}: {
  page?: CursorPage
  hasPrevious: boolean
  onPrevious: () => void
  onNext: (cursor: string) => void
}) {
  if (!hasPrevious && !page?.nextCursor) return null
  return (
    <nav
      aria-label="Directory pages"
      className="mt-3 flex items-center justify-between gap-3"
    >
      <span className="text-xs text-muted-foreground">
        Up to {page?.limit ?? 0} results per page
      </span>
      <div className="flex gap-2">
        <Button
          disabled={!hasPrevious}
          onClick={onPrevious}
          size="sm"
          variant="secondary"
        >
          Previous
        </Button>
        <Button
          disabled={!page?.nextCursor}
          onClick={() => page?.nextCursor && onNext(page.nextCursor)}
          size="sm"
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

function PersonForm({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Exclude<PersonEditor, null>
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useChurch()
  const person = editor === 'new' ? null : editor
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    setSaving(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const common = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      email: String(form.get('email') ?? '') || (person ? null : undefined),
      phone: String(form.get('phone') ?? '') || (person ? null : undefined),
      membershipStatus: String(form.get('membershipStatus') ?? 'guest'),
      volunteerReady: form.get('volunteerReady') === 'on',
      notes: String(form.get('notes') ?? '') || (person ? null : undefined),
    }
    try {
      if (person) {
        await apiRequest(
          `/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ version: person.version, ...common }),
          },
        )
      } else {
        await apiRequest(`/api/people/${encodeURIComponent(churchId)}`, {
          method: 'POST',
          body: JSON.stringify(common),
        })
      }
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The person could not be saved.',
      )
      setSaving(false)
    }
  }

  return (
    <Card className="mb-4" elevation="raised">
      <CardHeader className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              {person
                ? `Edit ${person.firstName} ${person.lastName}`
                : 'Add a person'}
            </CardTitle>
            <CardDescription>
              Contact and care notes remain inside this church instance.
            </CardDescription>
          </div>
          <Button
            aria-label="Close"
            onClick={onCancel}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </CardHeader>
      <form className="grid gap-4" onSubmit={submit}>
        <FieldGrid>
          <Field label="First name" required>
            <Input
              defaultValue={person?.firstName}
              maxLength={100}
              name="firstName"
              required
            />
          </Field>
          <Field label="Last name" required>
            <Input
              defaultValue={person?.lastName}
              maxLength={100}
              name="lastName"
              required
            />
          </Field>
          <Field label="Email">
            <Input defaultValue={person?.email} name="email" type="email" />
          </Field>
          <Field label="Phone">
            <Input defaultValue={person?.phone} maxLength={50} name="phone" />
          </Field>
          <Field label="Membership status">
            <Select
              defaultValue={person?.membershipStatus ?? 'guest'}
              name="membershipStatus"
            >
              {membershipStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end">
            <CheckboxField
              defaultChecked={person?.volunteerReady}
              label="Volunteer ready"
              name="volunteerReady"
            />
          </div>
        </FieldGrid>
        <Field
          hint="Only visible to accounts with directory access."
          label="Private notes"
        >
          <Textarea
            defaultValue={person?.notes}
            maxLength={10_000}
            name="notes"
            rows={4}
          />
        </Field>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions>
          <Button disabled={saving} size="sm" type="submit">
            {saving ? 'Saving…' : 'Save person'}
          </Button>
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        </FormActions>
      </form>
    </Card>
  )
}

function HouseholdForm({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Exclude<HouseholdEditor, null>
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useChurch()
  const household = editor === 'new' ? null : editor
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    setSaving(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const value = {
      name: String(form.get('name') ?? ''),
      street:
        String(form.get('street') ?? '') || (household ? null : undefined),
      city: String(form.get('city') ?? '') || (household ? null : undefined),
      state: String(form.get('state') ?? '') || (household ? null : undefined),
      postalCode:
        String(form.get('postalCode') ?? '') || (household ? null : undefined),
      countryCode: String(form.get('countryCode') ?? 'US'),
    }
    try {
      if (household) {
        await apiRequest(
          `/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ version: household.version, ...value }),
          },
        )
      } else {
        await apiRequest(`/api/households/${encodeURIComponent(churchId)}`, {
          method: 'POST',
          body: JSON.stringify(value),
        })
      }
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The household could not be saved.',
      )
      setSaving(false)
    }
  }

  return (
    <Card className="mb-4" elevation="raised">
      <CardHeader className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              {household ? `Edit ${household.name}` : 'Add a household'}
            </CardTitle>
            <CardDescription>
              Household contact information remains private to the church.
            </CardDescription>
          </div>
          <Button
            aria-label="Close"
            onClick={onCancel}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </CardHeader>
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Household name" required>
          <Input
            defaultValue={household?.name}
            maxLength={160}
            name="name"
            required
          />
        </Field>
        <Field label="Street">
          <Input defaultValue={household?.address.street} name="street" />
        </Field>
        <FieldGrid>
          <Field label="City">
            <Input defaultValue={household?.address.city} name="city" />
          </Field>
          <Field label="State / region">
            <Input defaultValue={household?.address.state} name="state" />
          </Field>
          <Field label="Postal code">
            <Input
              defaultValue={household?.address.postalCode}
              name="postalCode"
            />
          </Field>
          <Field label="Country code" required>
            <Input
              defaultValue={household?.address.countryCode ?? 'US'}
              maxLength={2}
              minLength={2}
              name="countryCode"
              required
            />
          </Field>
        </FieldGrid>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions>
          <Button disabled={saving} size="sm" type="submit">
            {saving ? 'Saving…' : 'Save household'}
          </Button>
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        </FormActions>
      </form>
    </Card>
  )
}

function HouseholdMemberForm({
  household,
  people,
  onSaved,
}: {
  household: Household
  people: Person[]
  onSaved: () => Promise<void>
}) {
  const { churchId } = useChurch()
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    const form = new FormData(event.currentTarget)
    const personId = String(form.get('personId') ?? '')
    if (!personId) return
    try {
      await apiRequest(
        `/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}/members/${encodeURIComponent(personId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            version: household.version,
            relationship: form.get('relationship'),
            isPrimary: form.get('isPrimary') === 'on',
          }),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The household member could not be saved.',
      )
    }
  }

  return (
    <form
      className="mt-3 grid gap-3 rounded-md border border-border bg-surface-sunken p-3"
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Person" required>
          <Select defaultValue="" name="personId" required selectSize="sm">
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
        <Field label="Relationship">
          <Select defaultValue="other" name="relationship" selectSize="sm">
            {relationships.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <CheckboxField label="Primary household contact" name="isPrimary" />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button size="sm" type="submit" variant="secondary">
          <Plus />
          Add or update member
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PeoplePage() {
  const { churchId } = useChurch()
  const { isSignedIn, isLoading: authLoading, user } = useAuthState()
  const [view, setView] = useState<DirectoryView>('people')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [peopleCursors, setPeopleCursors] = useState<Array<string | null>>([
    null,
  ])
  const [householdCursors, setHouseholdCursors] = useState<
    Array<string | null>
  >([null])
  const [personEditor, setPersonEditor] = useState<PersonEditor>(null)
  const [householdEditor, setHouseholdEditor] = useState<HouseholdEditor>(null)
  const [expandedHousehold, setExpandedHousehold] = useState<string | null>(
    null,
  )
  const [mutationError, setMutationError] = useState<string | null>(null)

  const membership = user?.memberships.find(
    (entry) => entry.churchId === churchId,
  )
  const permissions = membership?.permissions ?? []
  const canWritePeople = can(permissions, 'people.write')
  const canReadHouseholds = can(permissions, 'households.read')
  const canWriteHouseholds = can(permissions, 'households.write')

  const churchQuery = useApiQuery<{ church: Church }>(
    churchId ? `/api/churches/${encodeURIComponent(churchId)}` : null,
  )
  const peopleCursor = peopleCursors.at(-1)
  const householdCursor = householdCursors.at(-1)
  const peopleParams = new URLSearchParams({ limit: '12' })
  if (appliedSearch) peopleParams.set('query', appliedSearch)
  if (status) peopleParams.set('status', status)
  if (peopleCursor) peopleParams.set('cursor', peopleCursor)
  const householdParams = new URLSearchParams({ limit: '12' })
  if (appliedSearch) householdParams.set('query', appliedSearch)
  if (householdCursor) householdParams.set('cursor', householdCursor)

  const peopleQuery = useApiQuery<{ people: Person[]; page: CursorPage }>(
    isSignedIn && churchId
      ? `/api/people/${encodeURIComponent(churchId)}?${peopleParams}`
      : null,
  )
  const householdQuery = useApiQuery<{
    households: Household[]
    page: CursorPage
  }>(
    isSignedIn && canReadHouseholds && churchId
      ? `/api/households/${encodeURIComponent(churchId)}?${householdParams}`
      : null,
  )
  const peopleOptionsQuery = useApiQuery<{ people: Person[] }>(
    isSignedIn && canWriteHouseholds && churchId
      ? `/api/people/${encodeURIComponent(churchId)}?limit=100`
      : null,
  )

  useEffect(() => {
    setPeopleCursors([null])
    setHouseholdCursors([null])
  }, [appliedSearch, status])

  const loading =
    authLoading ||
    (view === 'people' && peopleQuery.isLoading) ||
    (view === 'households' && householdQuery.isLoading)
  const hasFilters = Boolean(appliedSearch || status)

  async function editPerson(person: Person) {
    if (!churchId) return
    setMutationError(null)
    try {
      const result = await apiRequest<{ person: PersonDetail }>(
        `/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`,
      )
      setPersonEditor(result.person)
    } catch (caught) {
      setMutationError(
        caught instanceof ApiError
          ? caught.message
          : 'The person could not be loaded.',
      )
    }
  }

  async function deletePerson(person: Person) {
    if (
      !churchId ||
      !window.confirm(`Delete ${person.firstName} ${person.lastName}?`)
    )
      return
    try {
      await apiRequest(
        `/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: person.version }) },
      )
      await peopleQuery.refetch()
    } catch (caught) {
      setMutationError(
        caught instanceof ApiError
          ? caught.message
          : 'The person could not be deleted.',
      )
    }
  }

  async function deleteHousehold(household: Household) {
    if (!churchId || !window.confirm(`Delete ${household.name}?`)) return
    try {
      await apiRequest(
        `/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ version: household.version }),
        },
      )
      await householdQuery.refetch()
    } catch (caught) {
      setMutationError(
        caught instanceof ApiError
          ? caught.message
          : 'The household could not be deleted.',
      )
    }
  }

  async function removeMember(household: Household, member: HouseholdMember) {
    if (!churchId) return
    try {
      await apiRequest(
        `/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}/members/${encodeURIComponent(member.personId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ version: household.version }),
        },
      )
      await householdQuery.refetch()
    } catch (caught) {
      setMutationError(
        caught instanceof ApiError
          ? caught.message
          : 'The member could not be removed.',
      )
    }
  }

  function clearFilters() {
    setSearch('')
    setAppliedSearch('')
    setStatus('')
  }

  const church = churchQuery.data?.church

  return (
    <PageShell>
      <PageHeader
        actions={
          isSignedIn && view === 'people' && canWritePeople ? (
            <Button onClick={() => setPersonEditor('new')} size="sm">
              <Plus />
              Add person
            </Button>
          ) : isSignedIn && view === 'households' && canWriteHouseholds ? (
            <Button onClick={() => setHouseholdEditor('new')} size="sm">
              <Plus />
              Add household
            </Button>
          ) : null
        }
        description={
          church
            ? `Protected directory for ${church.name}`
            : 'Protected church directory'
        }
        eyebrow="Directory"
        title="People"
      />

      {!isSignedIn && !authLoading ? (
        <EmptyState
          description="People records stay private to this church. Sign in to open the directory."
          icon={Users}
          title="Sign in to view the directory"
        />
      ) : null}

      {isSignedIn ? (
        <>
          <Toolbar>
            <Tabs
              label="Directory view"
              onValueChange={(next) => setView(next as DirectoryView)}
              value={view}
            >
              <Tab value="people">People</Tab>
              {canReadHouseholds ? (
                <Tab value="households">Households</Tab>
              ) : null}
            </Tabs>
            <ToolbarSpacer />
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                setAppliedSearch(search.trim())
              }}
              role="search"
            >
              <label className="sr-only" htmlFor="directory-search">
                Search directory
              </label>
              <SearchInput
                className="sm:w-64"
                id="directory-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  view === 'people'
                    ? 'Search name, email, or phone'
                    : 'Search household or member'
                }
                value={search}
              />
              {view === 'people' ? (
                <Select
                  aria-label="Membership status"
                  containerClassName="sm:w-44"
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
                >
                  <option value="">All statuses</option>
                  {membershipStatuses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Button size="default" type="submit" variant="secondary">
                Search
              </Button>
              {hasFilters ? (
                <Button onClick={clearFilters} size="default" variant="ghost">
                  Clear
                </Button>
              ) : null}
            </form>
          </Toolbar>

          {mutationError ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {mutationError}
            </p>
          ) : null}

          {view === 'people' ? (
            <>
              {personEditor ? (
                <PersonForm
                  editor={personEditor}
                  onCancel={() => setPersonEditor(null)}
                  onSaved={async () => {
                    setPersonEditor(null)
                    await Promise.all([
                      peopleQuery.refetch(),
                      peopleOptionsQuery.refetch(),
                    ])
                  }}
                />
              ) : null}

              {loading ? (
                <TableContainer>
                  <SkeletonTable columns={4} rows={6} />
                </TableContainer>
              ) : peopleQuery.error?.status === 403 ? (
                <EmptyState
                  description="Ask an administrator for the people.read permission on this church."
                  icon={Users}
                  title="No directory access"
                />
              ) : peopleQuery.data?.people.length ? (
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Contact
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Status
                        </TableHead>
                        {canWritePeople ? (
                          <TableHead align="right">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peopleQuery.data.people.map((person) => {
                        const fullName = `${person.firstName} ${person.lastName}`
                        return (
                          <TableRow className="group/row" key={person.id}>
                            {/*
                              Phones get one content column, not three. Contact
                              and status fold into this cell below the name and
                              their own columns are hidden, which leaves the
                              name room to breathe and the row actions room to
                              fit. The cell is still width-capped so a long
                              name ellipsizes rather than widening the table.
                            */}
                            <TableCell className="max-w-[13rem] sm:max-w-xs">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={fullName} size="default" />
                                <div className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {fullName}
                                  </span>
                                  <div className="flex items-center gap-1.5 sm:hidden">
                                    <StatusBadge
                                      size="sm"
                                      status={person.membershipStatus}
                                    />
                                    <TableMeta className="truncate">
                                      {person.email ?? person.phone ?? '—'}
                                    </TableMeta>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {person.email ? (
                                <a
                                  className="text-brand-text hover:underline"
                                  href={`mailto:${person.email}`}
                                >
                                  {person.email}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {person.phone ? (
                                <TableMeta>{person.phone}</TableMeta>
                              ) : null}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={person.membershipStatus} />
                                {/*
                                  Labelled "Ready to serve", not "Volunteer":
                                  that is a membership status, so a
                                  volunteer-ready member read "Volunteer /
                                  Volunteer". This flag means available to
                                  serve, whatever the person's status.
                                */}
                                {person.volunteerReady ? (
                                  <Badge size="sm" variant="outline">
                                    <HeartHandshake aria-hidden />
                                    <span className="sr-only sm:not-sr-only">
                                      Ready to serve
                                    </span>
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            {canWritePeople ? (
                              <TableCell align="right">
                                <TableActions>
                                  <Button
                                    aria-label={`Edit ${fullName}`}
                                    onClick={() => void editPerson(person)}
                                    size="icon-xs"
                                    variant="ghost"
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    aria-label={`Delete ${fullName}`}
                                    onClick={() => void deletePerson(person)}
                                    size="icon-xs"
                                    variant="destructive-ghost"
                                  >
                                    <Trash2 />
                                  </Button>
                                </TableActions>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <EmptyState
                  action={
                    hasFilters ? (
                      <Button
                        onClick={clearFilters}
                        size="sm"
                        variant="secondary"
                      >
                        Clear filters
                      </Button>
                    ) : canWritePeople ? (
                      <Button onClick={() => setPersonEditor('new')} size="sm">
                        <Plus />
                        Add person
                      </Button>
                    ) : null
                  }
                  description={
                    hasFilters
                      ? 'No one in this directory matches the current search and filters.'
                      : 'Add the first person to start building this church directory.'
                  }
                  icon={Users}
                  title={hasFilters ? 'No matches' : 'No people yet'}
                />
              )}

              <Pagination
                hasPrevious={peopleCursors.length > 1}
                onNext={(cursor) =>
                  setPeopleCursors((value) => [...value, cursor])
                }
                onPrevious={() =>
                  setPeopleCursors((value) => value.slice(0, -1))
                }
                page={peopleQuery.data?.page}
              />
            </>
          ) : (
            <>
              {householdEditor ? (
                <HouseholdForm
                  editor={householdEditor}
                  onCancel={() => setHouseholdEditor(null)}
                  onSaved={async () => {
                    setHouseholdEditor(null)
                    await householdQuery.refetch()
                  }}
                />
              ) : null}

              {loading ? (
                <TableContainer>
                  <SkeletonTable columns={3} rows={5} />
                </TableContainer>
              ) : householdQuery.data?.households.length ? (
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Household</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Location
                        </TableHead>
                        <TableHead align="right">Members</TableHead>
                        {canWriteHouseholds ? (
                          <TableHead align="right">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {householdQuery.data.households.map((household) => {
                        const expanded = expandedHousehold === household.id
                        const location =
                          [household.address.city, household.address.state]
                            .filter(Boolean)
                            .join(', ') || 'No address yet'
                        return (
                          <Fragment key={household.id}>
                            <TableRow className="group/row">
                              <TableCell>
                                <button
                                  aria-expanded={expanded}
                                  className="flex items-center gap-2 text-left font-medium"
                                  onClick={() =>
                                    setExpandedHousehold(
                                      expanded ? null : household.id,
                                    )
                                  }
                                  type="button"
                                >
                                  {expanded ? (
                                    <ChevronDown
                                      aria-hidden
                                      className="size-4 text-muted-foreground"
                                    />
                                  ) : (
                                    <ChevronRight
                                      aria-hidden
                                      className="size-4 text-muted-foreground"
                                    />
                                  )}
                                  {household.name}
                                </button>
                                <TableMeta className="pl-6 sm:hidden">
                                  {location}
                                </TableMeta>
                              </TableCell>
                              <TableCell className="hidden text-muted-foreground sm:table-cell">
                                {location}
                              </TableCell>
                              <TableCell align="right">
                                {household.members.length}
                              </TableCell>
                              {canWriteHouseholds ? (
                                <TableCell align="right">
                                  <TableActions>
                                    <Button
                                      aria-label={`Edit ${household.name}`}
                                      onClick={() =>
                                        setHouseholdEditor(household)
                                      }
                                      size="icon-xs"
                                      variant="ghost"
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      aria-label={`Delete ${household.name}`}
                                      onClick={() =>
                                        void deleteHousehold(household)
                                      }
                                      size="icon-xs"
                                      variant="destructive-ghost"
                                    >
                                      <Trash2 />
                                    </Button>
                                  </TableActions>
                                </TableCell>
                              ) : null}
                            </TableRow>
                            {expanded ? (
                              <TableRow>
                                <TableCell
                                  className="bg-surface-sunken/60 p-4"
                                  colSpan={canWriteHouseholds ? 4 : 3}
                                >
                                  {household.members.length ? (
                                    <ul className="grid gap-1.5">
                                      {household.members.map((member) => (
                                        <li
                                          className="flex items-center justify-between gap-2 text-sm"
                                          key={member.personId}
                                        >
                                          <span className="flex items-center gap-2">
                                            <Avatar
                                              name={`${member.firstName} ${member.lastName}`}
                                              size="sm"
                                            />
                                            <span className="font-medium">
                                              {member.firstName}{' '}
                                              {member.lastName}
                                            </span>
                                            <Badge size="sm" variant="neutral">
                                              {humanizeStatus(
                                                member.relationship,
                                              )}
                                            </Badge>
                                            {member.isPrimary ? (
                                              <Badge size="sm" variant="brand">
                                                Primary
                                              </Badge>
                                            ) : null}
                                          </span>
                                          {canWriteHouseholds ? (
                                            <Button
                                              onClick={() =>
                                                void removeMember(
                                                  household,
                                                  member,
                                                )
                                              }
                                              size="xs"
                                              variant="ghost"
                                            >
                                              Remove
                                            </Button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">
                                      No one has been added to this household
                                      yet.
                                    </p>
                                  )}
                                  {canWriteHouseholds ? (
                                    <HouseholdMemberForm
                                      household={household}
                                      onSaved={householdQuery.refetch}
                                      people={
                                        peopleOptionsQuery.data?.people ?? []
                                      }
                                    />
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <EmptyState
                  action={
                    hasFilters ? (
                      <Button
                        onClick={clearFilters}
                        size="sm"
                        variant="secondary"
                      >
                        Clear filters
                      </Button>
                    ) : canWriteHouseholds ? (
                      <Button
                        onClick={() => setHouseholdEditor('new')}
                        size="sm"
                      >
                        <Plus />
                        Add household
                      </Button>
                    ) : null
                  }
                  description={
                    hasFilters
                      ? 'No household matches the current search.'
                      : 'Group people into households to keep addresses and family relationships together.'
                  }
                  icon={Home}
                  title={hasFilters ? 'No matches' : 'No households yet'}
                />
              )}

              <Pagination
                hasPrevious={householdCursors.length > 1}
                onNext={(cursor) =>
                  setHouseholdCursors((value) => [...value, cursor])
                }
                onPrevious={() =>
                  setHouseholdCursors((value) => value.slice(0, -1))
                }
                page={householdQuery.data?.page}
              />
            </>
          )}
        </>
      ) : null}
    </PageShell>
  )
}
