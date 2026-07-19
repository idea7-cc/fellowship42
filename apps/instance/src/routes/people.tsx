import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { useAuthState } from '@/lib/auth-provider'
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
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type DirectoryView = 'people' | 'households'
type PersonEditor = PersonDetail | 'new' | null
type HouseholdEditor = Household | 'new' | null

const fieldClass =
  'flex min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center border-dashed p-8">
      <CardContent><p className="text-center text-muted-foreground">{children}</p></CardContent>
    </Card>
  )
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
    <nav aria-label="Directory pages" className="mt-6 flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">Up to {page?.limit ?? 0} results per page</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!page?.nextCursor}
        onClick={() => page?.nextCursor && onNext(page.nextCursor)}
      >
        Next
      </Button>
    </nav>
  )
}

function PersonForm({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Exclude<PersonEditor, null>
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useParams<{ churchId: string }>()
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
        await apiRequest(`/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: person.version, ...common }),
        })
      } else {
        await apiRequest(`/api/people/${encodeURIComponent(churchId)}`, {
          method: 'POST',
          body: JSON.stringify(common),
        })
      }
      await onSaved()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The person could not be saved.')
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{person ? `Edit ${person.firstName} ${person.lastName}` : 'Add a person'}</CardTitle>
        <CardDescription>Contact and care notes remain inside this church instance.</CardDescription>
      </CardHeader>
      <CardContent className="mt-5">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">First name<Input name="firstName" required maxLength={100} defaultValue={person?.firstName} /></label>
            <label className="grid gap-1 text-sm font-semibold">Last name<Input name="lastName" required maxLength={100} defaultValue={person?.lastName} /></label>
            <label className="grid gap-1 text-sm font-semibold">Email<Input name="email" type="email" defaultValue={person?.email} /></label>
            <label className="grid gap-1 text-sm font-semibold">Phone<Input name="phone" maxLength={50} defaultValue={person?.phone} /></label>
            <label className="grid gap-1 text-sm font-semibold">
              Membership status
              <select name="membershipStatus" className={fieldClass} defaultValue={person?.membershipStatus ?? 'guest'}>
                <option value="guest">Guest</option>
                <option value="regular-attender">Regular attender</option>
                <option value="member">Member</option>
                <option value="volunteer">Volunteer</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold">
              <input name="volunteerReady" type="checkbox" defaultChecked={person?.volunteerReady} />
              Volunteer ready
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Private notes
            <textarea name="notes" rows={4} maxLength={10_000} className={fieldClass} defaultValue={person?.notes} />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save person'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
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
  const { churchId } = useParams<{ churchId: string }>()
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
      street: String(form.get('street') ?? '') || (household ? null : undefined),
      city: String(form.get('city') ?? '') || (household ? null : undefined),
      state: String(form.get('state') ?? '') || (household ? null : undefined),
      postalCode: String(form.get('postalCode') ?? '') || (household ? null : undefined),
      countryCode: String(form.get('countryCode') ?? 'US'),
    }
    try {
      if (household) {
        await apiRequest(`/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: household.version, ...value }),
        })
      } else {
        await apiRequest(`/api/households/${encodeURIComponent(churchId)}`, {
          method: 'POST',
          body: JSON.stringify(value),
        })
      }
      await onSaved()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The household could not be saved.')
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{household ? `Edit ${household.name}` : 'Add a household'}</CardTitle>
        <CardDescription>Household contact information remains private to the church.</CardDescription>
      </CardHeader>
      <CardContent className="mt-5">
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm font-semibold">Household name<Input name="name" required maxLength={160} defaultValue={household?.name} /></label>
          <label className="grid gap-1 text-sm font-semibold">Street<Input name="street" defaultValue={household?.address.street} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">City<Input name="city" defaultValue={household?.address.city} /></label>
            <label className="grid gap-1 text-sm font-semibold">State / region<Input name="state" defaultValue={household?.address.state} /></label>
            <label className="grid gap-1 text-sm font-semibold">Postal code<Input name="postalCode" defaultValue={household?.address.postalCode} /></label>
            <label className="grid gap-1 text-sm font-semibold">Country code<Input name="countryCode" required minLength={2} maxLength={2} defaultValue={household?.address.countryCode ?? 'US'} /></label>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save household'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
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
  const { churchId } = useParams<{ churchId: string }>()
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
      setError(caught instanceof ApiError ? caught.message : 'The household member could not be saved.')
    }
  }
  return (
    <form className="mt-4 grid gap-3 border-t border-border pt-4" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">
          Person
          <select name="personId" required className={fieldClass} defaultValue="">
            <option value="" disabled>Select a person</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Relationship
          <select name="relationship" className={fieldClass} defaultValue="other">
            <option value="spouse">Spouse</option><option value="child">Child</option>
            <option value="parent">Parent</option><option value="guardian">Guardian</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold"><input name="isPrimary" type="checkbox" /> Primary household contact</label>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" variant="outline">Add or update member</Button>
    </form>
  )
}

export function PeoplePage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { isSignedIn, isLoading: authLoading, user } = useAuthState()
  const [view, setView] = useState<DirectoryView>('people')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [peopleCursors, setPeopleCursors] = useState<Array<string | null>>([null])
  const [householdCursors, setHouseholdCursors] = useState<Array<string | null>>([null])
  const [personEditor, setPersonEditor] = useState<PersonEditor>(null)
  const [householdEditor, setHouseholdEditor] = useState<HouseholdEditor>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const membership = user?.memberships.find((entry) => entry.churchId === churchId)
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
  const householdQuery = useApiQuery<{ households: Household[]; page: CursorPage }>(
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

  const loading = authLoading || peopleQuery.isLoading || (view === 'households' && householdQuery.isLoading)

  async function editPerson(person: Person) {
    if (!churchId) return
    setMutationError(null)
    try {
      const result = await apiRequest<{ person: PersonDetail }>(
        `/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`,
      )
      setPersonEditor(result.person)
    } catch (caught) {
      setMutationError(caught instanceof ApiError ? caught.message : 'The person could not be loaded.')
    }
  }

  async function deletePerson(person: Person) {
    if (!churchId || !window.confirm(`Delete ${person.firstName} ${person.lastName}?`)) return
    try {
      await apiRequest(`/api/people/${encodeURIComponent(churchId)}/${encodeURIComponent(person.id)}`, {
        method: 'DELETE', body: JSON.stringify({ version: person.version }),
      })
      await peopleQuery.refetch()
    } catch (caught) {
      setMutationError(caught instanceof ApiError ? caught.message : 'The person could not be deleted.')
    }
  }

  async function deleteHousehold(household: Household) {
    if (!churchId || !window.confirm(`Delete ${household.name}?`)) return
    try {
      await apiRequest(`/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}`, {
        method: 'DELETE', body: JSON.stringify({ version: household.version }),
      })
      await householdQuery.refetch()
    } catch (caught) {
      setMutationError(caught instanceof ApiError ? caught.message : 'The household could not be deleted.')
    }
  }

  async function removeMember(household: Household, member: HouseholdMember) {
    if (!churchId) return
    try {
      await apiRequest(
        `/api/households/${encodeURIComponent(churchId)}/${encodeURIComponent(household.id)}/members/${encodeURIComponent(member.personId)}`,
        { method: 'DELETE', body: JSON.stringify({ version: household.version }) },
      )
      await householdQuery.refetch()
    } catch (caught) {
      setMutationError(caught instanceof ApiError ? caught.message : 'The member could not be removed.')
    }
  }

  return (
    <PageShell>
      <Section>
        <Eyebrow>Directory</Eyebrow>
        <h1>People &amp; households</h1>
        <p className="mt-2">{churchQuery.data?.church ? `Protected directory for ${churchQuery.data.church.name}` : 'Protected church directory'}</p>
      </Section>

      <Section>
        {!isSignedIn && !authLoading ? <EmptyCard>People records stay private. Sign in to access this directory.</EmptyCard> : null}
        {isSignedIn ? (
          <>
            <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Directory view">
              <Button type="button" size="sm" variant={view === 'people' ? 'default' : 'outline'} role="tab" aria-selected={view === 'people'} onClick={() => setView('people')}>People</Button>
              {canReadHouseholds ? <Button type="button" size="sm" variant={view === 'households' ? 'default' : 'outline'} role="tab" aria-selected={view === 'households'} onClick={() => setView('households')}>Households</Button> : null}
            </div>
            <form
              role="search"
              className="mb-6 flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()) }}
            >
              <label className="sr-only" htmlFor="directory-search">Search directory</label>
              <Input id="directory-search" placeholder={view === 'people' ? 'Search name, email, or phone' : 'Search household or member'} value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-md" />
              {view === 'people' ? (
                <select aria-label="Membership status" className={`${fieldClass} sm:max-w-48`} value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option><option value="guest">Guest</option>
                  <option value="regular-attender">Regular attender</option><option value="member">Member</option>
                  <option value="volunteer">Volunteer</option><option value="inactive">Inactive</option>
                </select>
              ) : null}
              <Button type="submit" size="sm">Search</Button>
              {(appliedSearch || status) ? <Button type="button" size="sm" variant="outline" onClick={() => { setSearch(''); setAppliedSearch(''); setStatus('') }}>Clear</Button> : null}
            </form>
            {mutationError ? <p role="alert" className="mb-4 text-sm text-destructive">{mutationError}</p> : null}
            {loading ? <EmptyCard>Loading directory…</EmptyCard> : view === 'people' ? (
              <>
                <div className="mb-5 flex justify-end">{canWritePeople ? <Button type="button" size="sm" onClick={() => setPersonEditor('new')}>Add person</Button> : null}</div>
                {personEditor ? <PersonForm editor={personEditor} onCancel={() => setPersonEditor(null)} onSaved={async () => { setPersonEditor(null); await Promise.all([peopleQuery.refetch(), peopleOptionsQuery.refetch()]) }} /> : null}
                {peopleQuery.error?.status === 403 ? <EmptyCard>Your account does not have directory access.</EmptyCard> : peopleQuery.data?.people.length ? (
                  <CardGrid minWidth="280px">
                    {peopleQuery.data.people.map((person) => (
                      <Card key={person.id}>
                        <CardHeader><CardTitle>{person.firstName} {person.lastName}</CardTitle>{person.email ? <CardDescription>{person.email}</CardDescription> : null}</CardHeader>
                        <CardContent className="mt-4">
                          <div className="flex flex-wrap gap-2"><Badge variant="pill">{person.membershipStatus}</Badge>{person.volunteerReady ? <Badge variant="outline">Volunteer-ready</Badge> : null}</div>
                          {canWritePeople ? <div className="mt-4 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void editPerson(person)}>Edit</Button><Button type="button" size="sm" variant="destructive" onClick={() => void deletePerson(person)}>Delete</Button></div> : null}
                        </CardContent>
                      </Card>
                    ))}
                  </CardGrid>
                ) : <EmptyCard>No people match this directory view.</EmptyCard>}
                <Pagination page={peopleQuery.data?.page} hasPrevious={peopleCursors.length > 1} onPrevious={() => setPeopleCursors((value) => value.slice(0, -1))} onNext={(cursor) => setPeopleCursors((value) => [...value, cursor])} />
              </>
            ) : (
              <>
                <div className="mb-5 flex justify-end">{canWriteHouseholds ? <Button type="button" size="sm" onClick={() => setHouseholdEditor('new')}>Add household</Button> : null}</div>
                {householdEditor ? <HouseholdForm editor={householdEditor} onCancel={() => setHouseholdEditor(null)} onSaved={async () => { setHouseholdEditor(null); await householdQuery.refetch() }} /> : null}
                {householdQuery.data?.households.length ? (
                  <CardGrid minWidth="320px">
                    {householdQuery.data.households.map((household) => (
                      <Card key={household.id}>
                        <CardHeader><CardTitle>{household.name}</CardTitle><CardDescription>{[household.address.city, household.address.state].filter(Boolean).join(', ') || 'No address yet'}</CardDescription></CardHeader>
                        <CardContent className="mt-4">
                          <div className="grid gap-2">{household.members.map((member) => <div key={member.personId} className="flex items-center justify-between gap-2 text-sm"><span>{member.firstName} {member.lastName} · {member.relationship}{member.isPrimary ? ' · primary' : ''}</span>{canWriteHouseholds ? <Button type="button" size="sm" variant="ghost" onClick={() => void removeMember(household, member)}>Remove</Button> : null}</div>)}</div>
                          {canWriteHouseholds ? <><HouseholdMemberForm household={household} people={peopleOptionsQuery.data?.people ?? []} onSaved={householdQuery.refetch} /><div className="mt-4 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setHouseholdEditor(household)}>Edit</Button><Button type="button" size="sm" variant="destructive" onClick={() => void deleteHousehold(household)}>Delete</Button></div></> : null}
                        </CardContent>
                      </Card>
                    ))}
                  </CardGrid>
                ) : <EmptyCard>No households match this directory view.</EmptyCard>}
                <Pagination page={householdQuery.data?.page} hasPrevious={householdCursors.length > 1} onPrevious={() => setHouseholdCursors((value) => value.slice(0, -1))} onNext={(cursor) => setHouseholdCursors((value) => [...value, cursor])} />
              </>
            )}
          </>
        ) : null}
      </Section>
    </PageShell>
  )
}
