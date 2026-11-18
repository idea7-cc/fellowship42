import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupRosterPanel } from '../../src/components/group-roster-panel'
import { ContributionsPage } from '../../src/routes/contributions'
import type { Contribution, Group, Person } from '../../contracts/api'
import {
  apiError,
  flush,
  mountStaff,
  stubApi,
  waitForSearch,
} from './staff-harness'

let ui: Awaited<ReturnType<typeof mountStaff>> | undefined
afterEach(async () => {
  await ui?.unmount()
  ui = undefined
})

const person = (index: number): Person =>
  ({
    id: `person-${index}`,
    churchId: 'church',
    firstName: 'Sample',
    lastName: `Person ${String(index).padStart(3, '0')}`,
    email: `sample${index}@example.test`,
    membershipStatus: 'member',
    volunteerReady: false,
    version: 1,
  }) as Person

const peoplePage = (from: number, to: number, nextCursor: string | null) =>
  Response.json({
    people: Array.from({ length: to - from + 1 }, (_, offset) =>
      person(from + offset),
    ),
    page: { limit: 20, nextCursor },
  })

function rosterPanel() {
  return (
    <GroupRosterPanel
      churchId="church"
      group={{ id: 'group', title: 'Midtown' } as Group}
      onClose={() => {}}
    />
  )
}

const roster = {
  members: [
    {
      id: 'membership-1',
      groupId: 'group',
      personId: 'person-1',
      firstName: 'Sample',
      lastName: 'Person 001',
      status: 'active',
      notes: 'Met at the summer picnic.',
      version: 4,
    },
  ],
  leaders: [],
  activeCount: 1,
}

describe('record pickers', () => {
  it('reaches a person beyond the first page of search results and adds them', async () => {
    const api = stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.method === 'PUT') return Response.json(roster)
      if (call.path.startsWith('/api/people/church?')) {
        const params = new URL(call.path, 'https://x.test').searchParams
        return params.get('cursor') === 'person-20'
          ? peoplePage(21, 30, null)
          : peoplePage(1, 20, 'person-20')
      }
    })
    ui = await mountStaff(rosterPanel())
    await ui.type(ui.combobox('Add member'), 'Sample')
    await waitForSearch()

    const search = api.requests('GET', '/api/people/church?').at(-1)!
    expect(
      new URL(search.path, 'https://x.test').searchParams.get('query'),
    ).toBe('Sample')
    // The current member is not offered: their status has a row control.
    expect(
      ui.options().some((o) => o.textContent?.includes('Person 001')),
    ).toBe(false)
    expect(
      ui.options().some((o) => o.textContent?.includes('Person 027')),
    ).toBe(false)

    await ui.click(ui.button('Show more results'))
    const option = ui
      .options()
      .find((candidate) => candidate.textContent?.includes('Person 027'))!
    await ui.click(option)
    expect(ui.combobox('Add member').value).toBe('Sample Person 027')

    await ui.submit(ui.formWith('status'))
    const put = api.requests('PUT')
    expect(put).toHaveLength(1)
    expect(put[0]!.path).toBe('/api/groups/church/group/members/person-27')
    // No note in the body, so the Worker keeps whatever is stored.
    expect(put[0]!.body).toEqual({ status: 'active', version: 0 })
  })

  it('shows a failed search with a retry instead of an empty list', async () => {
    let failures = 1
    stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?'))
        return failures-- > 0
          ? apiError(503, 'unavailable', 'The directory is unavailable.')
          : peoplePage(2, 3, null)
    })
    ui = await mountStaff(rosterPanel())
    await ui.click(ui.combobox('Add member'))
    expect(ui.alert()).toContain('The directory is unavailable.')
    expect(ui.options()).toHaveLength(0)

    await ui.click(ui.button('Try again'))
    expect(ui.alert()).toBeNull()
    expect(ui.options().map((option) => option.textContent)).toEqual([
      'Sample Person 002sample2@example.test',
      'Sample Person 003sample3@example.test',
    ])
  })

  it('ignores a slower response for an earlier search', async () => {
    const api = stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?')) return 'defer'
    })
    ui = await mountStaff(rosterPanel())
    const input = ui.combobox('Add member')
    await ui.type(input, 'Sam')
    await waitForSearch()
    await ui.type(input, 'Sample Person 030')
    await waitForSearch()

    api.held('GET', 'query=Sample+Person').resolve(peoplePage(30, 30, null))
    await flush()
    api.held('GET', 'query=Sam').resolve(peoplePage(2, 21, 'person-21'))
    await flush()
    expect(ui.options().map((option) => option.textContent)).toEqual([
      'Sample Person 030sample30@example.test',
    ])
  })

  it('chooses with the keyboard', async () => {
    stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?'))
        return peoplePage(2, 4, null)
    })
    ui = await mountStaff(rosterPanel())
    const input = ui.combobox('Add leader')
    const key = async (name: string) => {
      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: name, bubbles: true }),
        )
      })
      await flush()
    }
    await key('ArrowDown')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    await key('ArrowDown')
    await key('ArrowDown')
    expect(
      document.getElementById(input.getAttribute('aria-activedescendant')!)
        ?.textContent,
    ).toContain('Person 003')
    await key('Enter')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.value).toBe('Sample Person 003')
  })
})

async function press(input: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  await act(async () => {
    input.dispatchEvent(event)
  })
  await flush()
  return event
}

describe('picker input that no longer names the choice', () => {
  const people = (call: { path: string }) => {
    const query = new URL(call.path, 'https://x.test').searchParams.get('query')
    const names = query?.startsWith('Ana')
      ? [{ id: 'ana', firstName: 'Ana', lastName: 'Powell' }]
      : query?.startsWith('Ben')
        ? [{ id: 'ben', firstName: 'Ben', lastName: 'Baker' }]
        : []
    return Response.json({
      people: names,
      page: { limit: 20, nextCursor: null },
    })
  }

  it('Enter over replaced text submits nothing and clears the earlier choice', async () => {
    const api = stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?')) return people(call)
      if (call.method === 'PUT') return Response.json(roster)
    })
    ui = await mountStaff(rosterPanel())
    await ui.choose('Add member', 'Ana', 'Ana Powell')
    const form = ui.formWith('status')
    expect(ui.field('personId', form).value).toBe('ana')

    const input = ui.combobox('Add member')
    await ui.type(input, 'Someone else')
    expect(ui.field('personId', form).value).toBe('')
    // The list is open with nothing active: Enter is the list's, not the form's.
    expect((await press(input, 'Enter')).defaultPrevented).toBe(true)
    await ui.submit(form)
    expect(api.requests('PUT')).toHaveLength(0)
    expect(ui.alert()).toContain('Choose a person')
  })

  it('does not offer the previous search while a new one settles', async () => {
    stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?')) return people(call)
    })
    ui = await mountStaff(rosterPanel())
    const input = ui.combobox('Add member')
    await ui.type(input, 'Ana')
    await waitForSearch()
    expect(ui.options().map((option) => option.textContent)).toEqual([
      'Ana Powell',
    ])
    await ui.type(input, 'Ben')
    expect(ui.options()).toHaveLength(0)
    await press(input, 'ArrowDown')
    await press(input, 'Enter')
    expect(ui.field('personId', ui.formWith('status')).value).toBe('')
    expect(input.value).toBe('Ben')
    await waitForSearch()
    expect(ui.options().map((option) => option.textContent)).toEqual([
      'Ben Baker',
    ])
  })

  it('reopens with a fresh unfiltered search after Escape', async () => {
    const api = stubApi((call) => {
      if (call.path.endsWith('/roster')) return Response.json(roster)
      if (call.path.startsWith('/api/people/church?'))
        return call.path.includes('query=')
          ? people(call)
          : peoplePage(2, 3, null)
    })
    ui = await mountStaff(rosterPanel())
    const input = ui.combobox('Add member')
    await ui.type(input, 'Nobody')
    await waitForSearch()
    expect(ui.status()).toBe('No matches.')
    await press(input, 'Escape')
    expect(input.value).toBe('')
    await ui.click(ui.button('Show add member options'))
    expect(
      api.requests('GET', '/api/people/church?').at(-1)!.path,
    ).not.toContain('query=')
    expect(ui.status()).toBe('2 results.')
  })
})

describe('picker keyboard and announcements', () => {
  it('scrolls the active option into view, keeps focus on Show more, and announces counts', async () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? '')
    }
    try {
      stubApi((call) => {
        if (call.path.endsWith('/roster')) return Response.json(roster)
        if (call.path.startsWith('/api/people/church?'))
          return call.path.includes('cursor=')
            ? peoplePage(22, 22, null)
            : peoplePage(2, 21, 'person-21')
      })
      ui = await mountStaff(rosterPanel())
      const input = ui.combobox('Add member')
      await act(async () => input.focus())
      await press(input, 'ArrowDown')
      expect(ui.status()).toBe('20 results, more available.')
      await press(input, 'ArrowDown')
      await press(input, 'ArrowDown')
      expect(scrolled.at(-1)).toContain('Person 003')

      await ui.click(ui.button('Show more results'))
      expect(document.activeElement).toBe(input)
      expect(ui.status()).toBe('21 results.')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})

const contribution = (index: number): Contribution => ({
  id: `contribution-${index}`,
  churchId: 'church',
  donorName: `Donor ${String(index).padStart(3, '0')}`,
  amountMinor: 1000 + index,
  currency: 'USD',
  fund: 'General',
  paymentMethod: 'cash',
  status: 'succeeded',
  recurring: false,
  donatedAt: 1_767_225_600_000,
  createdAt: 1_767_225_600_000,
  updatedAt: 1_767_225_600_000,
  version: 1,
})

describe('paged lists', () => {
  it('reaches the next page of contributions and starts again when the search changes', async () => {
    const api = stubApi(
      (call) => {
        if (!call.path.startsWith('/api/contributions/church?'))
          return undefined
        const params = new URL(call.path, 'https://x.test').searchParams
        const start = params.get('cursor') === 'contribution-25' ? 26 : 1
        const count = params.get('query') ? 1 : 25
        return Response.json({
          contributions: Array.from({ length: count }, (_, offset) =>
            contribution(start + offset),
          ),
          page: {
            limit: 25,
            nextCursor:
              start === 1 && !params.get('query') ? 'contribution-25' : null,
          },
        })
      },
      ['contributions.read'],
    )
    ui = await mountStaff(<ContributionsPage />)
    expect(ui.text()).toContain('Donor 025')
    expect(ui.text()).not.toContain('Donor 026')

    await ui.click(ui.button('Next'))
    expect(api.requests('GET', '/api/contributions/').at(-1)!.path).toContain(
      'cursor=contribution-25',
    )
    expect(ui.text()).toContain('Donor 026')
    expect(ui.text()).toContain('Page 2')

    const search = ui.container.querySelector<HTMLInputElement>(
      'form[role="search"] input',
    )!
    await ui.type(search, 'Donor 003')
    await ui.submit(search.form!)
    const latest = api.requests('GET', '/api/contributions/').at(-1)!.path
    expect(latest).toContain('query=Donor+003')
    expect(latest).not.toContain('cursor=')
    expect(ui.text()).not.toContain('Page 2')

    // Clearing the search is a new list too: it starts at page 1, not at the
    // page the unfiltered list was on before.
    await ui.type(search, '')
    await ui.submit(search.form!)
    const cleared = api.requests('GET', '/api/contributions/').at(-1)!.path
    expect(cleared).not.toContain('cursor=')
    expect(cleared).not.toContain('query=')
    expect(ui.text()).toContain('Page 1')
  })

  it('shows a failed list load with a retry', async () => {
    let failures = 1
    stubApi(
      (call) => {
        if (!call.path.startsWith('/api/contributions/church?'))
          return undefined
        return failures-- > 0
          ? apiError(503, 'unavailable', 'Contributions are unavailable.')
          : Response.json({
              contributions: [contribution(1)],
              page: { limit: 25, nextCursor: null },
            })
      },
      ['contributions.read'],
    )
    ui = await mountStaff(<ContributionsPage />)
    expect(ui.alert()).toContain('Contributions are unavailable.')
    expect(ui.text()).not.toContain('No contributions have been recorded.')
    await ui.click(ui.button('Try again'))
    expect(ui.text()).toContain('Donor 001')
  })
})
