import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { ChurchImagePicker } from '../../src/components/church-image-picker'
import { GroupSessionsPanel } from '../../src/components/group-sessions-panel'
import { ContributionsPage } from '../../src/routes/contributions'
import { MediaPage } from '../../src/routes/media'
import { PeoplePage } from '../../src/routes/people'
import type { Group } from '../../contracts/api'
import {
  apiError,
  mountStaff,
  stubApi,
  type RecordedCall,
} from './staff-harness'

/*
 * Entry forms must survive a lost response. The fake server below behaves like
 * the Worker: it records a create once per Idempotency-Key, replays the same
 * request, and rejects a key reused for different details. "Lost" responses
 * commit on the server and then fail in the browser, which is the case where
 * the user cannot know whether the entry was saved.
 */

function keyedServer(prefix: string) {
  const rows: Array<{ id: string; body: unknown }> = []
  const keys = new Map<string, { body: string; id: string }>()
  const seenKeys: Array<string | null> = []
  let loseNext = false
  return {
    rows,
    seenKeys,
    loseNextResponse() {
      loseNext = true
    },
    async create(
      call: RecordedCall,
      respond: (id: string, replayed: boolean) => Response,
    ) {
      const key = call.headers.get('idempotency-key')
      seenKeys.push(key)
      // Like the Worker's checksum, a file body is compared by its contents.
      const body =
        call.body instanceof Blob
          ? `file:${await call.body.text()}`
          : JSON.stringify(call.body ?? null)
      let result: Response
      const existing = key ? keys.get(key) : undefined
      if (existing && existing.body !== body) {
        result = apiError(
          409,
          'idempotency_key_conflict',
          'This entry was already submitted with different details. Check the saved records before starting a new entry.',
        )
      } else if (existing) {
        result = respond(existing.id, true)
      } else {
        const id = `${prefix}-${rows.length + 1}`
        rows.push({ id, body: call.body })
        if (key) keys.set(key, { body, id })
        result = respond(id, false)
      }
      if (loseNext) {
        loseNext = false
        throw new TypeError('Failed to fetch')
      }
      return result
    },
  }
}

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  await cleanup?.()
  cleanup = null
})

describe('contributions', () => {
  async function renderContributions() {
    const server = keyedServer('contribution')
    const api = stubApi(async (call) => {
      if (call.method === 'POST') {
        return server.create(call, (id, replayed) =>
          Response.json(
            {
              contribution: {
                id,
                churchId: 'church',
                donorName: 'Donor',
                amountMinor: 100,
                currency: 'USD',
                fund: 'General',
                paymentMethod: 'cash',
                status: 'succeeded',
                recurring: false,
                donatedAt: 0,
                createdAt: 0,
                updatedAt: 0,
                version: 1,
              },
              replayed,
            },
            { status: 201 },
          ),
        )
      }
      return Response.json({
        contributions: server.rows.map((row) => ({
          id: row.id,
          churchId: 'church',
          donorName: (row.body as { donorName: string }).donorName,
          amountMinor: (row.body as { amountMinor: number }).amountMinor,
          currency: 'USD',
          fund: 'General',
          paymentMethod: 'cash',
          status: 'succeeded',
          recurring: false,
          donatedAt: 0,
          createdAt: 0,
          updatedAt: 0,
          version: 1,
        })),
        page: { limit: 100, nextCursor: null },
      })
    })
    const ui = await mountStaff(<ContributionsPage />)
    cleanup = ui.unmount
    const form = ui.form()
    async function fill(donorName: string, amount: string) {
      await ui.type(ui.field('donorName', form), donorName)
      await ui.type(ui.field('amountMinor', form), amount)
      await ui.type(ui.field('donatedAt', form), '2026-09-20T10:00')
    }
    return { api, server, ui, form, fill }
  }

  it('reports a successful save as success and starts a clean entry', async () => {
    const { api, ui, form, fill } = await renderContributions()
    const listReads = api.requests('GET', '/api/contributions/').length
    await fill('Ada Donor', '2500')
    await ui.submit(form)
    expect(ui.alert()).toBeNull()
    expect(ui.status()).toContain('Contribution recorded')
    expect(ui.field('donorName', form).value).toBe('')
    expect(api.requests('GET', '/api/contributions/').length).toBeGreaterThan(
      listReads,
    )
    expect(ui.text()).toContain('Ada Donor')
  })

  it('retries a lost response with the same key and records one contribution', async () => {
    const { server, ui, form, fill } = await renderContributions()
    await fill('Lost Response', '4000')
    server.loseNextResponse()
    await ui.submit(form)
    expect(ui.alert()).toMatch(/will not be recorded twice/)
    expect(ui.field('donorName', form).value).toBe('Lost Response')
    await ui.submit(form)
    expect(server.seenKeys).toHaveLength(2)
    expect(server.seenKeys[0]).toBeTruthy()
    expect(server.seenKeys[1]).toBe(server.seenKeys[0])
    expect(server.rows).toHaveLength(1)
    expect(ui.status()).toContain('Contribution recorded')
  })

  it('uses a new key for the next entry after a confirmed save', async () => {
    const { server, ui, form, fill } = await renderContributions()
    await fill('Same Gift', '1000')
    await ui.submit(form)
    await fill('Same Gift', '1000')
    await ui.submit(form)
    expect(server.rows).toHaveLength(2)
    expect(server.seenKeys[1]).not.toBe(server.seenKeys[0])
  })

  it('explains a changed retry and lets staff start a new entry', async () => {
    const { server, ui, form, fill } = await renderContributions()
    await fill('Changed Mind', '1000')
    server.loseNextResponse()
    await ui.submit(form)
    await ui.type(ui.field('amountMinor', form), '1500')
    await ui.submit(form)
    expect(ui.alert()).toMatch(/different details/)
    expect(server.rows).toHaveLength(1)
    await ui.click(ui.button('Start a new entry'))
    expect(ui.alert()).toBeNull()
    expect(ui.field('donorName', form).value).toBe('')
    await fill('Changed Mind', '1500')
    await ui.submit(form)
    expect(server.rows).toHaveLength(2)
    expect(new Set(server.seenKeys).size).toBe(2)
  })
})

describe('directory entries', () => {
  async function renderDirectory() {
    const people = keyedServer('person')
    const households = keyedServer('household')
    const api = stubApi(async (call) => {
      if (call.method === 'POST' && call.path === '/api/people/church') {
        return people.create(call, (id, replayed) =>
          Response.json({ person: { id }, replayed }, { status: 201 }),
        )
      }
      if (call.method === 'POST' && call.path === '/api/households/church') {
        return households.create(call, (id, replayed) =>
          Response.json({ household: { id }, replayed }, { status: 201 }),
        )
      }
      if (call.path.startsWith('/api/people/church')) {
        return Response.json({
          people: [],
          page: { limit: 12, nextCursor: null },
        })
      }
      if (call.path.startsWith('/api/households/church')) {
        return Response.json({
          households: [],
          page: { limit: 12, nextCursor: null },
        })
      }
      return Response.json({
        church: { id: 'church', name: 'Grace', timezone: 'America/Chicago' },
      })
    })
    const ui = await mountStaff(<PeoplePage />)
    cleanup = ui.unmount
    return { api, people, households, ui }
  }

  it('keeps the person entry key across a lost response', async () => {
    const { people, ui } = await renderDirectory()
    await ui.click(ui.button('Add person'))
    const form = ui.form()
    await ui.type(ui.field('firstName', form), 'Retry')
    await ui.type(ui.field('lastName', form), 'Visitor')
    people.loseNextResponse()
    await ui.submit(form)
    expect(ui.alert()).toMatch(/will not be saved twice/)
    await ui.submit(ui.form())
    expect(people.seenKeys[0]).toBeTruthy()
    expect(people.seenKeys[1]).toBe(people.seenKeys[0])
    expect(people.rows).toHaveLength(1)
    expect(ui.text()).not.toContain('Add a person')
  })

  it('lets staff start a new person entry after a changed retry', async () => {
    const { people, ui } = await renderDirectory()
    await ui.click(ui.button('Add person'))
    await ui.type(ui.field('firstName', ui.form()), 'Changed')
    await ui.type(ui.field('lastName', ui.form()), 'Mind')
    people.loseNextResponse()
    await ui.submit(ui.form())
    await ui.type(ui.field('lastName', ui.form()), 'Minds')
    await ui.submit(ui.form())
    expect(ui.alert()).toMatch(/different details/)
    expect(people.rows).toHaveLength(1)
    // Choosing Add person again keeps the open entry, typed input included.
    await ui.click(ui.button('Add person'))
    expect(ui.field('lastName', ui.form()).value).toBe('Minds')
    await ui.click(ui.button('Start a new entry'))
    expect(ui.alert()).toBeNull()
    expect(ui.field('firstName', ui.form()).value).toBe('')
    await ui.type(ui.field('firstName', ui.form()), 'Changed')
    await ui.type(ui.field('lastName', ui.form()), 'Minds')
    await ui.submit(ui.form())
    expect(people.rows).toHaveLength(2)
    expect(new Set(people.seenKeys).size).toBe(2)
    expect(ui.text()).not.toContain('Add a person')
  })

  it('lets staff start a new household entry after a changed retry', async () => {
    const { households, ui } = await renderDirectory()
    await ui.click(ui.button('Households'))
    await ui.click(ui.button('Add household'))
    await ui.type(ui.field('name', ui.form()), 'Rivera Household')
    households.loseNextResponse()
    await ui.submit(ui.form())
    await ui.type(ui.field('city', ui.form()), 'Austin')
    await ui.submit(ui.form())
    expect(ui.alert()).toMatch(/different details/)
    await ui.click(ui.button('Start a new entry'))
    expect(ui.alert()).toBeNull()
    expect(ui.field('name', ui.form()).value).toBe('')
    await ui.type(ui.field('name', ui.form()), 'Rivera Household')
    await ui.type(ui.field('city', ui.form()), 'Austin')
    await ui.submit(ui.form())
    expect(households.rows).toHaveLength(2)
    expect(new Set(households.seenKeys).size).toBe(2)
    expect(ui.text()).not.toContain('Add a household')
  })

  it('keeps the household entry key across a lost response', async () => {
    const { households, ui } = await renderDirectory()
    await ui.click(ui.button('Households'))
    await ui.click(ui.button('Add household'))
    const form = ui.form()
    await ui.type(ui.field('name', form), 'Retry Household')
    households.loseNextResponse()
    await ui.submit(form)
    expect(ui.alert()).toMatch(/will not be saved twice/)
    await ui.submit(ui.form())
    expect(households.seenKeys[0]).toBeTruthy()
    expect(households.seenKeys[1]).toBe(households.seenKeys[0])
    expect(households.rows).toHaveLength(1)
  })
})

it('keeps the group session entry key across a lost response', async () => {
  const sessions = keyedServer('session')
  stubApi(async (call) => {
    if (call.method === 'POST') {
      return sessions.create(call, (_id, replayed) =>
        Response.json({ sessions: [], replayed }, { status: 201 }),
      )
    }
    return Response.json({ sessions: [] })
  })
  const ui = await mountStaff(
    <GroupSessionsPanel
      churchId="church"
      group={{ id: 'group', title: 'Alpha', location: 'Hall' } as Group}
      onClose={() => {}}
    />,
  )
  cleanup = ui.unmount
  await ui.click(ui.button('Add session'))
  const form = ui.form()
  await ui.type(ui.field('title', form), 'Retry night')
  sessions.loseNextResponse()
  await ui.submit(form)
  expect(ui.alert()).toMatch(/will not be saved twice/)
  expect(ui.field('title', ui.form()).value).toBe('Retry night')
  await ui.submit(ui.form())
  expect(sessions.seenKeys[0]).toBeTruthy()
  expect(sessions.seenKeys[1]).toBe(sessions.seenKeys[0])
  expect(sessions.rows).toHaveLength(1)
})

describe('group session entries', () => {
  async function renderSessions() {
    const sessions = keyedServer('session')
    stubApi(async (call) => {
      if (call.method === 'POST') {
        return sessions.create(call, (_id, replayed) =>
          Response.json({ sessions: [], replayed }, { status: 201 }),
        )
      }
      return Response.json({ sessions: [] })
    })
    const ui = await mountStaff(
      <GroupSessionsPanel
        churchId="church"
        group={{ id: 'group', title: 'Alpha', location: 'Hall' } as Group}
        onClose={() => {}}
      />,
    )
    cleanup = ui.unmount
    return { sessions, ui }
  }

  it('lets staff start a new session entry after a changed retry', async () => {
    const { sessions, ui } = await renderSessions()
    await ui.click(ui.button('Add session'))
    await ui.type(ui.field('title', ui.form()), 'Planning night')
    sessions.loseNextResponse()
    await ui.submit(ui.form())
    await ui.type(ui.field('title', ui.form()), 'Planning evening')
    await ui.submit(ui.form())
    expect(ui.alert()).toMatch(/different details/)
    await ui.click(ui.button('Start a new entry'))
    expect(ui.alert()).toBeNull()
    expect(ui.field('title', ui.form()).value).toBe('Weekly gathering')
    await ui.type(ui.field('title', ui.form()), 'Planning evening')
    await ui.submit(ui.form())
    expect(sessions.rows).toHaveLength(2)
    expect(new Set(sessions.seenKeys).size).toBe(2)
    expect(ui.alert()).toBeNull()
  })

  it('uses a new key for the next session after a confirmed save', async () => {
    const { sessions, ui } = await renderSessions()
    for (const title of ['Week one', 'Week two']) {
      await ui.click(ui.button('Add session'))
      await ui.type(ui.field('title', ui.form()), title)
      await ui.submit(ui.form())
    }
    expect(sessions.rows).toHaveLength(2)
    expect(sessions.seenKeys[1]).not.toBe(sessions.seenKeys[0])
  })
})

function chooseFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  })
}

it('keeps the media upload key across a lost response', async () => {
  const media = keyedServer('media')
  stubApi(async (call) => {
    if (call.method === 'POST') {
      return media.create(call, (id, replayed) =>
        Response.json({ media: { id }, replayed }, { status: 201 }),
      )
    }
    return Response.json({ media: [], page: { limit: 100, nextCursor: null } })
  })
  const ui = await mountStaff(<MediaPage />)
  cleanup = ui.unmount
  const form = ui.form()
  chooseFile(
    ui.field('file', form),
    new File(['bulletin'], 'bulletin.png', { type: 'image/png' }),
  )
  media.loseNextResponse()
  await ui.submit(form)
  expect(ui.alert()).toMatch(/will not be saved twice/)
  await ui.submit(form)
  expect(media.seenKeys[0]).toBeTruthy()
  expect(media.seenKeys[1]).toBe(media.seenKeys[0])
  expect(media.rows).toHaveLength(1)
  expect(ui.alert()).toBeNull()
})

it('uses a new key for the next media upload after a confirmed upload', async () => {
  const media = keyedServer('media')
  stubApi(async (call) => {
    if (call.method === 'POST') {
      return media.create(call, (id, replayed) =>
        Response.json({ media: { id }, replayed }, { status: 201 }),
      )
    }
    return Response.json({ media: [], page: { limit: 100, nextCursor: null } })
  })
  const ui = await mountStaff(<MediaPage />)
  cleanup = ui.unmount
  const form = ui.form()
  chooseFile(
    ui.field('file', form),
    new File(['bulletin'], 'bulletin.png', { type: 'image/png' }),
  )
  await ui.submit(form)
  expect(ui.alert()).toBeNull()
  chooseFile(
    ui.field('file', form),
    new File(['poster'], 'poster.png', { type: 'image/png' }),
  )
  await ui.submit(form)
  expect(ui.alert()).toBeNull()
  expect(media.seenKeys).toHaveLength(2)
  expect(media.seenKeys[1]).not.toBe(media.seenKeys[0])
  expect(media.rows).toHaveLength(2)
})

it('retries the same picked image with the same key and a different image with a new key', async () => {
  const media = keyedServer('image')
  stubApi(async (call) => {
    if (call.method === 'POST') {
      return media.create(call, (id, replayed) =>
        Response.json({ media: { id }, replayed }, { status: 201 }),
      )
    }
    return Response.json({ images: [], nextCursor: null })
  })
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    this.open = false
  }
  const onChange = vi.fn()
  const ui = await mountStaff(
    <ChurchImagePicker
      churchId="church"
      label="Logo"
      value={null}
      onChange={onChange}
      disabled={false}
    />,
  )
  cleanup = ui.unmount
  const pick = async (file: File) => {
    await ui.click(ui.button('Choose logo'))
    const input =
      ui.container.querySelector<HTMLInputElement>('input[type="file"]')!
    chooseFile(input, file)
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  const logo = new File(['logo'], 'logo.png', {
    type: 'image/png',
    lastModified: 1,
  })
  media.loseNextResponse()
  await pick(logo)
  expect(ui.alert()).toMatch(/will not be saved twice/)
  await pick(logo)
  expect(media.seenKeys[1]).toBe(media.seenKeys[0])
  expect(media.rows).toHaveLength(1)
  expect(onChange).toHaveBeenCalledWith('image-1')
  await pick(
    new File(['other'], 'other.png', { type: 'image/png', lastModified: 2 }),
  )
  expect(media.seenKeys[2]).toBeTruthy()
  expect(media.seenKeys[2]).not.toBe(media.seenKeys[0])
})
