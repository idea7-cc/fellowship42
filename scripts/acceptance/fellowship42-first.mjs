// Fellowship42-first acceptance journey on production builds and isolated,
// synthetic local state. Usage:
//   node scripts/acceptance/fellowship42-first.mjs [--out DIR] [--skip-build]
// Writes DIR/evidence.json and screenshots; exits non-zero on any failed check.
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import * as lib from './lib.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const out = path.resolve(
  option('--out', '/tmp/f42-acceptance/fellowship42-first'),
)
const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const INSTANCE = 'http://localhost:8787'
// Separate hostnames, as in production: each app gets its own passkey
// relying-party ID. *.localhost resolves to IPv6 loopback here.
const WEBSITE = 'http://www.localhost:8788'
const setupSecret = lib.secret()
const { checks, check } = lib.checklist()
const shot = (page, name, options = {}) =>
  page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
    ...options,
  })

rmSync(out, { recursive: true, force: true })
;(await import('node:fs')).mkdirSync(out, { recursive: true })
const state = {
  instance: path.join(out, 'state/instance'),
  website: path.join(out, 'state/website'),
}

console.log('Building production bundles…')
lib.buildAll({ skip: args.includes('--skip-build') })
lib.prepareInstanceState(state.instance)
const enrollToken = lib.enrollSeedOwner(state.instance)
const instanceVars = {
  SIGN_IN_ORIGIN: INSTANCE,
  MCP_ORIGIN: INSTANCE,
  WEBSITE_ORIGIN: WEBSITE,
  WEBSITE_SETUP_SECRET: setupSecret,
}
const logs = {
  instance: path.join(out, 'instance.log'),
  website: path.join(out, 'website.log'),
}
let instance = lib.startInstance({
  port: 8787,
  state: state.instance,
  vars: instanceVars,
  logFile: logs.instance,
})
await lib.waitFor(`${INSTANCE}/api/health`)
const health = await (await fetch(`${INSTANCE}/api/health`)).json()
const digest = health.bootstrap.portableIdentitySha256
lib.startWebsite({
  port: 8788,
  ip: '::1',
  state: state.website,
  vars: {
    EMDASH_SITE_URL: WEBSITE,
    FELLOWSHIP42_URL: INSTANCE,
    FELLOWSHIP42_INSTANCE_SHA256: digest,
    WEBSITE_SETUP_SECRET: setupSecret,
    EMDASH_ENCRYPTION_KEY: lib.emdashEncryptionKey(),
  },
  logFile: logs.website,
})
await lib.waitFor(`${WEBSITE}/`, { ok: (r) => r.status === 200 })

const browser = await chromium.launch({ executablePath: chromiumPath })
// Staff work from a browser in another time zone than the church.
const staff = await browser.newContext({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1280, height: 900 },
})
const page = await lib.passkeyPage(staff)
const network = path.join(out, 'auth-network.log')
page.on('response', async (response) => {
  if (!/\/(_emdash\/)?api\/(auth|setup)/.test(response.url())) return
  let body = ''
  try {
    body = (await response.text()).slice(0, 200)
  } catch {
    body = '<unreadable>'
  }
  ;(await import('node:fs')).appendFileSync(
    network,
    `${new Date().toISOString()} ${response.request().method()} ${response.url()} ${response.status()} ${body}\n`,
  )
})
page.on('console', (message) => {
  if (message.type() === 'error')
    (async () =>
      (await import('node:fs')).appendFileSync(
        network,
        `console: ${message.text().slice(0, 300)}\n`,
      ))()
})
const anonymous = await browser.newContext({
  viewport: { width: 1280, height: 900 },
})
const visitor = await anonymous.newPage()
const html = async (url) => {
  const response = await fetch(url)
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  }
}
const contract = async (resource, query = 'limit=100') =>
  (await fetch(`${INSTANCE}/api/website/v1/${resource}?${query}`)).json()
const emdash = (method, url, body) =>
  withProxyRetry(`owner ${method} ${url}`, async () => {
    const response = await page.request.fetch(`${WEBSITE}${url}`, {
      method,
      headers: { 'X-EmDash-Request': '1', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    })
    let json = null
    try {
      json = await response.json()
    } catch {
      json = null
    }
    return { status: response.status(), json }
  })
const staffApi = async (method, url, body) => {
  const response = await page.request.fetch(`${INSTANCE}${url}`, {
    method,
    headers: { Origin: INSTANCE, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  })
  return {
    status: response.status(),
    json: await response.json().catch(() => null),
  }
}
// wrangler dev's local proxy can drop the request after one the Worker
// refused without reading its body ("Network connection lost"). Retry only
// that logged transport failure, and record that it happened.
const transportRetries = []
async function withProxyRetry(label, send) {
  const { readFileSync: read } = await import('node:fs')
  for (let attempt = 0; ; attempt++) {
    const before = read(logs.website, 'utf8').length
    const response = await send()
    if (response.status !== 500 || attempt > 0) return response
    // wrangler writes the proxy error just after answering; wait for it.
    let dropped = false
    for (let wait = 0; wait < 20 && !dropped; wait++) {
      dropped = read(logs.website, 'utf8')
        .slice(before)
        .includes('Network connection lost')
      if (!dropped) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!dropped) return response
    transportRetries.push(label)
  }
}
const para = (text, key) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
})

try {
  console.log('\nFellowship42-first setup')
  await check('instance homepage redirects to the website', async () => {
    const response = await fetch(`${INSTANCE}/`, { redirect: 'manual' })
    lib.assert(response.status === 302, `status ${response.status}`)
    lib.assert(
      response.headers.get('location') === WEBSITE,
      response.headers.get('location'),
    )
    return { location: response.headers.get('location') }
  })

  await check(
    'a fresh website already shows published church records',
    async () => {
      const home = await html(`${WEBSITE}/`)
      const events = await contract('events', 'limit=3')
      lib.assert(home.status === 200, `status ${home.status}`)
      for (const event of events.items)
        lib.assert(home.text.includes(event.title), `missing ${event.title}`)
      return { events: events.items.map((event) => event.title) }
    },
  )

  await check(
    'EmDash setup is closed to anyone without an owner claim',
    async () => {
      const api = await fetch(`${WEBSITE}/_emdash/api/setup/admin`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-EmDash-Request': '1',
        },
        body: JSON.stringify({
          email: 'intruder@example.test',
          name: 'Intruder',
        }),
      })
      const bypass = await fetch(`${WEBSITE}/_emdash/api/setup/dev-bypass`)
      const wizard = await fetch(`${WEBSITE}/_emdash/admin/setup`, {
        redirect: 'manual',
      })
      lib.assert(api.status === 403, `setup api ${api.status}`)
      lib.assert(bypass.status === 403, `dev bypass ${bypass.status}`)
      lib.assert(
        wizard.status === 303 &&
          wizard.headers.get('location').endsWith('/fellowship42/setup'),
        `wizard ${wizard.status}`,
      )
      return {
        setupApi: api.status,
        devBypass: bypass.status,
        wizardRedirect: wizard.headers.get('location'),
      }
    },
  )

  await check('owner signs in to Fellowship42 with a passkey', async () => {
    await page.goto(`${INSTANCE}/sign-in#enroll=${enrollToken}`)
    await page.getByRole('button', { name: 'Create passkey' }).click()
    await page.waitForURL(`${INSTANCE}/app**`, { timeout: 30_000 })
    await page
      .getByText('Fellowship Demo Church')
      .first()
      .waitFor({ timeout: 15_000 })
    await shot(page, '01-staff-app')
    return { url: page.url() }
  })

  await check(
    'settings explain the website and where content is edited',
    async () => {
      await page.goto(`${INSTANCE}/app/settings`)
      await page
        .getByText('www.localhost:8788')
        .first()
        .waitFor({ timeout: 15_000 })
      const text = await page.locator('body').innerText()
      for (const phrase of [
        'www.localhost:8788',
        'Pages, articles, and menus are edited in the website editor',
        'Church details, gatherings, events, sermons, groups, and courses are edited here',
        'grant no access to people, giving, or settings',
      ])
        lib.assert(text.includes(phrase), `missing "${phrase}"`)
      await shot(page, '02-settings-website-card')
      return { card: 'shown' }
    },
  )

  await check(
    'owner claims the website editor and completes EmDash setup with a passkey',
    async () => {
      await page.getByRole('button', { name: 'Set up website editor' }).click()
      await page.waitForURL(`${WEBSITE}/_emdash/admin/setup**`, {
        timeout: 30_000,
      })
      await page
        .getByRole('textbox', { name: 'Site Title' })
        .fill('Fellowship Demo Church')
      await page
        .getByRole('textbox', { name: 'Tagline' })
        .fill('A church for the whole city')
      await shot(page, '03-emdash-setup-site')
      await page.getByRole('button', { name: 'Continue →' }).click()
      await page
        .getByRole('textbox', { name: 'Your Email' })
        .fill('owner@example.test')
      await page.getByRole('textbox', { name: 'Your Name' }).fill('Demo Owner')
      await page.getByRole('button', { name: 'Continue →' }).click()
      await page.getByRole('button', { name: 'Create passkey' }).click()
      await page.getByRole('button', { name: 'Open the dashboard' }).click()
      for (
        let attempt = 0;
        attempt < 3 && page.url().includes('/login');
        attempt++
      ) {
        await page.getByRole('button', { name: 'Sign in with Passkey' }).click()
        await page
          .waitForURL((url) => !url.pathname.includes('/login'), {
            timeout: 15_000,
          })
          .catch(() => {})
      }
      lib.assert(!page.url().includes('/login'), `still at ${page.url()}`)
      const me = await emdash('GET', '/_emdash/api/auth/me')
      lib.assert(me.json?.data?.role === 50, `role ${me.json?.data?.role}`)
      await shot(page, '04-emdash-dashboard')
      return { user: me.json.data.email, role: me.json.data.role }
    },
  )

  await check(
    'the setup window closes once the first administrator exists',
    async () => {
      const claim = await staffApi(
        'POST',
        '/api/website-setup/church_demo/claim',
      )
      lib.assert(claim.status === 200, `claim ${claim.status}`)
      const token = claim.json.url.split('#claim=')[1]
      const accept = await fetch(`${WEBSITE}/fellowship42/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: WEBSITE },
        body: JSON.stringify({ claim: token }),
      })
      const cookie = accept.headers.get('set-cookie').split(';')[0]
      const second = await fetch(`${WEBSITE}/_emdash/api/setup/admin`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-EmDash-Request': '1',
          cookie,
        },
        body: JSON.stringify({ email: 'second@example.test', name: 'Second' }),
      })
      lib.assert(accept.status === 200, `claim accepted ${accept.status}`)
      lib.assert(
        second.status >= 400 && second.status < 500,
        `second admin ${second.status}`,
      )
      return { claimAccepted: accept.status, secondAdmin: second.status }
    },
  )

  await check(
    'the website is tied to the correct church by the deployment',
    async () => {
      const status = await emdash(
        'POST',
        '/_emdash/api/plugins/fellowship42/admin',
        {
          type: 'page_load',
          page: '/status',
        },
      )
      const text = JSON.stringify(status.json)
      for (const phrase of [
        'Connected to Fellowship42',
        'Fellowship Demo Church',
        'Website deployment (cannot be changed here)',
        '(verified)',
      ])
        lib.assert(text.includes(phrase), `status page lacks ${phrase}`)
      const settings = await emdash(
        'PUT',
        '/_emdash/api/admin/plugins/fellowship42/settings',
        {
          values: { instanceUrl: 'https://attacker.example' },
        },
      )
      const home = await html(`${WEBSITE}/`)
      lib.assert(
        home.text.includes('Fellowship Demo Church'),
        'pinned connection changed by settings',
      )
      const nav = await page.goto(`${WEBSITE}/_emdash/admin`)
      lib.assert(nav.status() === 200, 'admin')
      const link = page.getByRole('link', { name: 'Fellowship42' }).first()
      await link.click({ timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await shot(page, '05-emdash-fellowship42-page')
      return { settingsWriteByAdmin: settings.status, pinned: true }
    },
  )

  console.log('\nEditorial work')
  let pageId
  await check(
    'an editor creates a draft page that visitors cannot see',
    async () => {
      const created = await emdash('POST', '/_emdash/api/content/pages', {
        slug: 'our-story',
        data: {
          title: 'Our story',
          content: [
            para('Draft: founded by neighbours in 1952.', 'a'),
            { _type: 'f42Events', _key: 'b', heading: 'Coming up', limit: 2 },
          ],
        },
      })
      lib.assert(
        created.status === 201 || created.status === 200,
        `create ${created.status}`,
      )
      pageId = created.json.data.item.id
      const visit = await fetch(`${WEBSITE}/our-story`, { redirect: 'manual' })
      lib.assert(visit.status === 404, `draft visible: ${visit.status}`)
      return { id: pageId, anonymousStatus: visit.status }
    },
  )

  await check('a private preview shows the unpublished draft', async () => {
    const preview = await emdash(
      'POST',
      `/_emdash/api/content/pages/${pageId}/preview-url`,
      {},
    )
    const url = new URL(preview.json.data.url, WEBSITE).href
    const response = await html(url)
    lib.assert(response.status === 200, `preview ${response.status}`)
    lib.assert(
      response.text.includes('founded by neighbours'),
      'draft text missing',
    )
    lib.assert(
      response.text.includes('Preview — this draft is not public'),
      'preview banner missing',
    )
    lib.assert(
      /no-store/.test(response.headers.get('cache-control') ?? ''),
      'preview cacheable',
    )
    await visitor.goto(url)
    await shot(visitor, '06-private-preview')
    return { previewCacheControl: response.headers.get('cache-control') }
  })

  await check(
    'publishing makes the page public with live church blocks',
    async () => {
      const published = await emdash(
        'POST',
        `/_emdash/api/content/pages/${pageId}/publish`,
        {},
      )
      lib.assert(published.status === 200, `publish ${published.status}`)
      const response = await html(`${WEBSITE}/our-story`)
      const events = await contract('events', 'limit=2')
      lib.assert(response.status === 200, `status ${response.status}`)
      lib.assert(response.text.includes('founded by neighbours'), 'text')
      for (const event of events.items)
        lib.assert(
          response.text.includes(event.title),
          `block missing ${event.title}`,
        )
      return { events: events.items.map((event) => event.title) }
    },
  )

  await check(
    'an edit to a published page stays private until published',
    async () => {
      const current = await emdash(
        'GET',
        `/_emdash/api/content/pages/${pageId}`,
      )
      const updated = await emdash(
        'PUT',
        `/_emdash/api/content/pages/${pageId}`,
        {
          data: {
            content: [
              para(
                'Revised: founded by neighbours in 1952 and still growing.',
                'a',
              ),
            ],
          },
          _rev: current.json.data._rev,
        },
      )
      lib.assert(updated.status === 200, `update ${updated.status}`)
      const before = await html(`${WEBSITE}/our-story`)
      lib.assert(
        !before.text.includes('still growing'),
        'unpublished edit is public',
      )
      await emdash('POST', `/_emdash/api/content/pages/${pageId}/publish`, {})
      const after = await html(`${WEBSITE}/our-story`)
      lib.assert(after.text.includes('still growing'), 'published edit missing')
      return { beforePublish: 'old text', afterPublish: 'new text' }
    },
  )

  await check(
    'the editor offers church blocks with their source explained',
    async () => {
      await page.goto(`${WEBSITE}/_emdash/admin/content/pages/${pageId}`)
      const editor = page.locator('.ProseMirror').first()
      await editor.waitFor({ timeout: 20_000 })
      // EmDash greets a first-time user with a dismissible dialog.
      await page.waitForTimeout(1500)
      for (let attempt = 0; attempt < 3; attempt++) {
        const dialog = page.getByRole('dialog')
        if (!(await dialog.count())) break
        await shot(page, '07a-editor-welcome')
        const close = dialog.getByRole('button').first()
        await close.click().catch(() => page.keyboard.press('Escape'))
        await page.waitForTimeout(500)
      }
      await editor.click()
      await page.keyboard.press('Control+End')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/Upcoming')
      const item = page.getByText('Upcoming events', { exact: false }).first()
      await item.waitFor({ timeout: 10_000 })
      await shot(page, '07-editor-church-blocks')
      await page.keyboard.press('Escape')
      return { slashMenu: 'Upcoming events offered' }
    },
  )

  console.log('\nChurch-content lifecycle')
  const eventInput = (overrides = {}) => ({
    slug: 'harvest-supper',
    title: 'Harvest Supper',
    status: 'published',
    summary: 'A shared meal to celebrate the season.',
    startsAt: Date.UTC(2027, 9, 10, 22, 30),
    endsAt: Date.UTC(2027, 9, 11, 0, 30),
    timezone: 'America/New_York',
    location: 'Fellowship Hall',
    registrationUrl: null,
    featured: false,
    capacity: null,
    ...overrides,
  })
  let event
  await check(
    'a published event appears on the next website request',
    async () => {
      const created = await staffApi(
        'POST',
        '/api/events/church_demo',
        eventInput(),
      )
      lib.assert(
        created.status === 201,
        `create ${created.status} ${JSON.stringify(created.json)}`,
      )
      event = created.json.event
      const response = await html(`${WEBSITE}/events`)
      lib.assert(response.text.includes('Harvest Supper'), 'event missing')
      const when = 'Sun, Oct 10, 2027 · 6:30 PM – 8:30 PM EDT'
      lib.assert(response.text.includes(when), 'event time not in event zone')
      return { event: event.id, rendered: when }
    },
  )

  await check(
    'an edited event shows the new title and never the old one',
    async () => {
      const edited = await staffApi(
        'PATCH',
        `/api/events/church_demo/${event.id}`,
        {
          version: event.version,
          title: 'Harvest Supper and Barn Dance',
        },
      )
      lib.assert(
        edited.status === 200,
        `edit ${edited.status} ${JSON.stringify(edited.json)}`,
      )
      event = edited.json.event
      const response = await html(`${WEBSITE}/events`)
      lib.assert(
        response.text.includes('Harvest Supper and Barn Dance'),
        'new title missing',
      )
      return { title: event.title }
    },
  )

  await check('a withdrawn event disappears on the next request', async () => {
    const withdrawn = await staffApi(
      'PATCH',
      `/api/events/church_demo/${event.id}`,
      {
        version: event.version,
        status: 'draft',
      },
    )
    lib.assert(withdrawn.status === 200, `withdraw ${withdrawn.status}`)
    event = withdrawn.json.event
    const response = await html(`${WEBSITE}/events`)
    lib.assert(
      !response.text.includes('Harvest Supper'),
      'withdrawn event still shown',
    )
    return { status: event.status }
  })

  await check('a deleted event disappears on the next request', async () => {
    const republished = await staffApi(
      'PATCH',
      `/api/events/church_demo/${event.id}`,
      {
        version: event.version,
        status: 'published',
      },
    )
    event = republished.json.event
    lib.assert(
      (await html(`${WEBSITE}/events`)).text.includes('Harvest Supper'),
      'republish',
    )
    const removed = await staffApi(
      'DELETE',
      `/api/events/church_demo/${event.id}`,
      {
        version: event.version,
      },
    )
    lib.assert(
      removed.status === 200 || removed.status === 204,
      `delete ${removed.status}`,
    )
    const response = await html(`${WEBSITE}/events`)
    lib.assert(
      !response.text.includes('Harvest Supper'),
      'deleted event still shown',
    )
    return { deleted: true }
  })

  await check(
    'events show in their own time zone whatever the staff browser zone',
    async () => {
      const created = await staffApi(
        'POST',
        '/api/events/church_demo',
        eventInput({
          slug: 'diwali-lights',
          title: 'Festival of Lights Evening',
          startsAt: Date.UTC(2027, 9, 29, 13, 30),
          endsAt: null,
          timezone: 'Asia/Kolkata',
        }),
      )
      lib.assert(created.status === 201, `create ${created.status}`)
      const response = await html(`${WEBSITE}/events`)
      lib.assert(
        response.text.includes('Festival of Lights Evening'),
        'missing',
      )
      lib.assert(
        response.text.includes('7:00 PM GMT+5:30'),
        'not rendered in Asia/Kolkata',
      )
      const staffZone = await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      return { staffBrowserZone: staffZone, rendered: '7:00 PM GMT+5:30' }
    },
  )

  await check(
    'a draft event stays private even beside a signed-in staff session',
    async () => {
      const draft = await staffApi(
        'POST',
        '/api/events/church_demo',
        eventInput({
          slug: 'private-planning',
          title: 'Private Planning Meeting',
          status: 'draft',
        }),
      )
      lib.assert(draft.status === 201, `create ${draft.status}`)
      const withSession = await page.request.fetch(
        `${INSTANCE}/api/website/v1/events?limit=100`,
      )
      const text = await withSession.text()
      lib.assert(
        !text.includes('Private Planning'),
        'draft in contract with staff session',
      )
      await page.goto(`${WEBSITE}/events`)
      lib.assert(
        !(await page.content()).includes('Private Planning'),
        'draft on website',
      )
      return {
        contractWithStaffSession: 'draft absent',
        website: 'draft absent',
      }
    },
  )

  await check(
    'larger datasets page through every record without truncation',
    async () => {
      const now = Date.now()
      const values = Array.from({ length: 130 }, (_, index) => {
        const id = `sermon_bulk_${String(index).padStart(3, '0')}`
        return `('${id}','church_demo','bulk-${index}','Bulk sermon ${String(index).padStart(3, '0')}','published','Guest','','${index % 7 === 0 ? 'Series' : ''}',${Date.UTC(2025, 0, 1) + index * 86_400_000 * 2},0,${now},${now})`
      })
      lib.instanceSql(
        state.instance,
        `INSERT INTO sermons (id, church_id, slug, title, status, speaker, summary, series, preached_at, featured, created_at, updated_at) VALUES ${values.join(',')};`,
      )
      let total = 0
      let cursor = null
      do {
        const pageData = await contract(
          'sermons',
          `limit=100${cursor ? `&cursor=${cursor}` : ''}`,
        )
        total += pageData.items.length
        cursor = pageData.nextCursor
      } while (cursor)
      const seen = new Set()
      let url = `${WEBSITE}/sermons`
      let pages = 0
      while (url && pages < 50) {
        const response = await html(url)
        for (const match of response.text.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g))
          seen.add(match[1])
        const next = response.text.match(/<a href="([^"]+)" rel="next"/)
        url = next
          ? new URL(next[1].replaceAll('&amp;', '&'), WEBSITE).href
          : null
        pages += 1
      }
      lib.assert(total > 100, `contract total ${total}`)
      lib.assert(seen.size === total, `website showed ${seen.size} of ${total}`)
      return {
        contractTotal: total,
        websiteDistinct: seen.size,
        websitePages: pages,
      }
    },
  )

  await check('an empty list shows a clear empty state', async () => {
    lib.instanceSql(
      state.instance,
      "UPDATE courses SET status='draft' WHERE church_id='church_demo';",
    )
    const response = await html(`${WEBSITE}/courses`)
    lib.instanceSql(
      state.instance,
      "UPDATE courses SET status='published' WHERE church_id='church_demo' AND id LIKE 'course_demo_%';",
    )
    lib.assert(
      response.text.includes('No courses are listed right now.'),
      'empty state missing',
    )
    return { message: 'No courses are listed right now.' }
  })

  await check(
    'church images and course links work across origins',
    async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFTEMLQkAMWM/wdyQyx8AAAAASUVORK5CYII=',
        'base64',
      )
      const upload = await page.request.fetch(
        `${INSTANCE}/api/media/church_demo?altText=${encodeURIComponent('Fellowship Demo Church logo')}`,
        {
          method: 'POST',
          headers: { Origin: INSTANCE, 'content-type': 'image/png' },
          data: png,
        },
      )
      const media = await upload.json()
      lib.assert(
        upload.status() === 201,
        `upload ${upload.status()} ${JSON.stringify(media)}`,
      )
      const mediaId = media.media.id
      const settings = (
        await staffApi('GET', '/api/church-settings/church_demo')
      ).json
      const saved = await staffApi(
        'POST',
        '/api/church-settings/church_demo/save',
        {
          version: settings.version,
          draft: { ...settings.draft, logoMediaId: mediaId },
        },
      )
      lib.assert(
        saved.status === 200,
        `save ${saved.status} ${JSON.stringify(saved.json)}`,
      )
      const published = await staffApi(
        'POST',
        '/api/church-settings/church_demo/publish',
        {
          version: saved.json.version,
        },
      )
      lib.assert(
        published.status === 200,
        `publish ${published.status} ${JSON.stringify(published.json)}`,
      )
      await visitor.goto(`${WEBSITE}/`)
      const logo = visitor
        .locator(`img[src="${INSTANCE}/media/${mediaId}"]`)
        .first()
      await logo.waitFor({ timeout: 15_000 })
      const loaded = await logo.evaluate(
        (img) => img.complete && img.naturalWidth > 0,
      )
      lib.assert(loaded, 'cross-origin logo did not load')
      await visitor.goto(`${WEBSITE}/courses`)
      const courseLink = visitor
        .locator(`a[href^="${INSTANCE}/courses/"]`)
        .first()
      const href = await courseLink.getAttribute('href')
      const course = await fetch(href)
      lib.assert(course.status === 200, `course page ${course.status}`)
      return { logo: `${INSTANCE}/media/${mediaId}`, courseLink: href }
    },
  )

  await check(
    'an unavailable source shows a deliberate notice, never stale content',
    async () => {
      lib.stopServer(instance)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const response = await html(`${WEBSITE}/events`)
      lib.assert(response.status === 200, `status ${response.status}`)
      lib.assert(
        response.text.includes('temporarily unavailable'),
        'notice missing',
      )
      lib.assert(
        !response.text.includes('Summer Church Picnic'),
        'stale content shown',
      )
      await visitor.goto(`${WEBSITE}/events`)
      await shot(visitor, '08-source-unavailable')
      instance = lib.startInstance({
        port: 8787,
        state: state.instance,
        vars: instanceVars,
        logFile: logs.instance,
      })
      await lib.waitFor(`${INSTANCE}/api/health`)
      const recovered = await html(`${WEBSITE}/events`)
      lib.assert(
        recovered.text.includes('Summer Church Picnic'),
        'did not recover',
      )
      return { whileDown: 'notice', afterRestart: 'records' }
    },
  )

  console.log('\nAccess boundaries')
  let editor
  await check(
    'an EmDash editor cannot change the Fellowship42 connection',
    async () => {
      const invite = await emdash('POST', '/_emdash/api/auth/invite', {
        email: 'editor@example.test',
        role: 40,
      })
      lib.assert(
        invite.status === 200 || invite.status === 201,
        `invite ${invite.status} ${JSON.stringify(invite.json)}`,
      )
      const inviteUrl = invite.json.data.inviteUrl
      const editorContext = await browser.newContext()
      const editorPage = await lib.passkeyPage(editorContext)
      await editorPage.goto(new URL(inviteUrl, WEBSITE).href)
      const name = editorPage.getByRole('textbox', { name: /name/i })
      if (await name.count()) await name.first().fill('Web Editor')
      await editorPage
        .getByRole('button', { name: /passkey|create|accept/i })
        .first()
        .click()
      await editorPage
        .waitForURL(
          (url) =>
            url.pathname.startsWith('/_emdash/admin') &&
            !url.pathname.includes('invite'),
          { timeout: 30_000 },
        )
        .catch(() => {})
      for (
        let attempt = 0;
        attempt < 3 && editorPage.url().includes('/login');
        attempt++
      ) {
        await editorPage
          .getByRole('button', { name: 'Sign in with Passkey' })
          .click()
        await editorPage
          .waitForURL((url) => !url.pathname.includes('/login'), {
            timeout: 15_000,
          })
          .catch(() => {})
      }
      const call = (method, url, body) =>
        withProxyRetry(`editor ${method} ${url}`, async () => {
          const response = await editorPage.request.fetch(`${WEBSITE}${url}`, {
            method,
            headers: {
              'X-EmDash-Request': '1',
              'content-type': 'application/json',
            },
            ...(body === undefined ? {} : { data: JSON.stringify(body) }),
          })
          return {
            status: response.status(),
            json: await response.json().catch(() => null),
          }
        })
      const me = await call('GET', '/_emdash/api/auth/me')
      lib.assert(
        me.json?.data?.role === 40,
        `editor role ${me.status} ${JSON.stringify(me.json)}`,
      )
      const change = await call(
        'PUT',
        '/_emdash/api/admin/plugins/fellowship42/settings',
        {
          values: { instanceUrl: 'https://attacker.example' },
        },
      )
      const anonymousChange = await withProxyRetry(
        'anonymous PUT settings',
        async () => {
          const response = await visitor.request.fetch(
            `${WEBSITE}/_emdash/api/admin/plugins/fellowship42/settings`,
            {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
                'X-EmDash-Request': '1',
              },
              data: JSON.stringify({
                values: { instanceUrl: 'https://attacker.example' },
              }),
            },
          )
          return { status: response.status() }
        },
      )
      const statusPage = await call(
        'POST',
        '/_emdash/api/plugins/fellowship42/admin',
        {
          type: 'page_load',
          page: '/status',
        },
      )
      lib.assert(
        change.status === 403,
        `editor settings write ${change.status}`,
      )
      lib.assert(
        anonymousChange.status === 401,
        `anonymous settings write ${anonymousChange.status}`,
      )
      lib.assert(
        statusPage.status === 200,
        `editor status page ${statusPage.status}`,
      )
      editor = { id: me.json.data.id, call, context: editorContext }
      return {
        editorSettingsWrite: change.status,
        anonymousSettingsWrite: anonymousChange.status,
        editorStatusPage: statusPage.status,
      }
    },
  )

  await check(
    'disabling an editor ends their access on the next request',
    async () => {
      const before = await editor.call('GET', '/_emdash/api/content/pages')
      const disabled = await emdash(
        'POST',
        `/_emdash/api/admin/users/${editor.id}/disable`,
        {},
      )
      lib.assert(disabled.status === 200, `disable ${disabled.status}`)
      const after = await editor.call('GET', '/_emdash/api/content/pages')
      lib.assert(before.status === 200, `before ${before.status}`)
      lib.assert(
        after.status === 401 || after.status === 403,
        `after ${after.status}`,
      )
      await editor.context.close()
      return { before: before.status, after: after.status }
    },
  )

  await check(
    'website editor accounts confer no Fellowship42 access',
    async () => {
      const response = await fetch(`${INSTANCE}/api/people/church_demo`)
      lib.assert(response.status === 401, `people ${response.status}`)
      return { peopleWithoutFellowship42Session: response.status }
    },
  )

  console.log('\nUsability')
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const phone = await mobile.newPage()
  await check('mobile pages fit the screen', async () => {
    const result = {}
    for (const route of ['/', '/visit', '/events', '/sermons', '/articles']) {
      await phone.goto(`${WEBSITE}${route}`)
      const overflow = await phone.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      lib.assert(overflow <= 0, `${route} overflows by ${overflow}px`)
      await shot(
        phone,
        `09-mobile${route === '/' ? '-home' : route.replaceAll('/', '-')}`,
      )
      result[route] = 'fits'
    }
    return result
  })

  await check(
    'keyboard users reach the skip link, navigation, and content',
    async () => {
      await visitor.goto(`${WEBSITE}/`)
      const order = []
      for (let index = 0; index < 40; index++) {
        await visitor.keyboard.press('Tab')
        const focused = await visitor.evaluate(() => {
          const element = document.activeElement
          if (!element || element === document.body) return null
          const style = getComputedStyle(element)
          return {
            text: (
              element.getAttribute('aria-label') ||
              element.textContent ||
              ''
            )
              .trim()
              .slice(0, 40),
            outline: style.outlineStyle,
          }
        })
        if (!focused) break
        order.push(focused)
      }
      lib.assert(
        order[0]?.text === 'Skip to content',
        `first focus: ${order[0]?.text}`,
      )
      lib.assert(
        order.some((item) => item.text === 'Events'),
        'navigation not reachable',
      )
      const invisible = order.filter(
        (item) => !item.outline || item.outline === 'none',
      )
      lib.assert(
        invisible.length === 0,
        `no visible focus: ${JSON.stringify(invisible)}`,
      )
      await visitor.goto(`${WEBSITE}/`)
      await visitor.keyboard.press('Tab')
      await visitor.keyboard.press('Enter')
      const target = await visitor.evaluate(() => document.activeElement?.id)
      lib.assert(target === 'main', `skip target ${target}`)
      return {
        focusableInOrder: order.length,
        first: order[0].text,
        skipTarget: target,
      }
    },
  )

  await check(
    'public pages have no serious or critical accessibility violations',
    async () => {
      const axe = readFileSync(
        path.join(lib.root, 'node_modules/axe-core/axe.min.js'),
        'utf8',
      )
      const report = {}
      for (const route of [
        '/',
        '/visit',
        '/events',
        '/sermons',
        '/groups',
        '/courses',
        '/articles',
        '/our-story',
      ]) {
        await visitor.goto(`${WEBSITE}${route}`)
        await visitor.addScriptTag({ content: axe })
        const result = await visitor.evaluate(async () =>
          // eslint-disable-next-line no-undef
          axe.run(document, {
            runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
          }),
        )
        const serious = result.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact),
        )
        report[route] = result.violations.map(
          (v) => `${v.id}:${v.impact}:${v.nodes.length}`,
        )
        lib.assert(
          serious.length === 0,
          `${route}: ${serious.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(', ')}`,
        )
      }
      return report
    },
  )

  await check('pages are server-rendered with metadata', async () => {
    const home = await html(`${WEBSITE}/`)
    const events = await html(`${WEBSITE}/events`)
    lib.assert(
      /<title>[^<]*Fellowship Demo Church[^<]*<\/title>/.test(home.text),
      'title',
    )
    lib.assert(/<meta name="description"/.test(home.text), 'description')
    lib.assert(/<link rel="canonical"/.test(home.text), 'canonical')
    lib.assert(/property="og:title"/.test(home.text), 'og:title')
    lib.assert(home.text.includes('"@type":"Church"'), 'JSON-LD')
    lib.assert(
      events.text.includes('Summer Church Picnic'),
      'server-rendered events',
    )
    lib.assert(
      events.headers.get('cache-control') === 'no-cache',
      `cache ${events.headers.get('cache-control')}`,
    )
    await visitor.goto(`${WEBSITE}/`)
    await shot(visitor, '10-desktop-home')
    return { cacheControl: events.headers.get('cache-control') }
  })
} finally {
  await browser.close().catch(() => {})
  lib.stopAll()
}

const versions = JSON.parse(
  readFileSync(
    path.join(lib.websiteDir, 'node_modules/emdash/package.json'),
    'utf8',
  ),
).version
const failed = checks.filter((item) => !item.pass)
lib.writeJson(path.join(out, 'evidence.json'), {
  journey: 'fellowship42-first',
  evidence:
    'local production builds on isolated synthetic state (wrangler dev / workerd)',
  node: process.version,
  emdash: versions,
  instanceIdentitySha256: digest,
  transportRetries,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
})
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed. Evidence: ${path.join(out, 'evidence.json')}`,
)
process.exit(failed.length ? 1 : 0)
