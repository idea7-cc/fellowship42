// Drives the browser part of the documented local evaluation in
// docs/emdash-church-websites.md against `pnpm dev` and `pnpm dev:website`.
// Follow the guide's commands first (fresh state, owner link, both dev
// servers), then run:
//   node scripts/acceptance/local-dev-journey.mjs [--link-file /tmp/owner-link.txt]
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { passkeyPage } from './lib.mjs'

const args = process.argv.slice(2)
const linkFile = args.includes('--link-file')
  ? args[args.indexOf('--link-file') + 1]
  : '/tmp/owner-link.txt'
const INSTANCE = 'http://localhost:5173'
const WEBSITE = 'http://www.localhost:4322'
const steps = []
const step = (name, observed) => {
  steps.push({ name, observed })
  console.log(`  ✓ ${name}${observed ? ` (${observed})` : ''}`)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
})
try {
  const page = await passkeyPage(
    await browser.newContext({ timezoneId: 'Europe/London' }),
  )
  page.on('dialog', (dialog) => {
    dialog.accept().catch(() => {})
  })
  await page.goto(readFileSync(linkFile, 'utf8').trim())
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await page.waitForURL(`${INSTANCE}/app**`)
  step('owner signed in with a passkey from the recovery link')

  await page.goto(`${INSTANCE}/app/settings`)
  await page.getByText('www.localhost:4322').first().waitFor()
  await page.getByRole('button', { name: 'Set up website editor' }).click()
  await page.waitForURL(`${WEBSITE}/_emdash/admin/setup**`, {
    timeout: 60_000,
  })
  step('Settings → Website → Set up website editor opened EmDash setup')

  await page
    .getByRole('textbox', { name: 'Site Title' })
    .fill('Fellowship Demo Church')
  await page.getByRole('button', { name: 'Continue →' }).click()
  await page
    .getByRole('textbox', { name: 'Your Email' })
    .fill('owner@example.test')
  await page.getByRole('textbox', { name: 'Your Name' }).fill('Demo Owner')
  await page.getByRole('button', { name: 'Continue →' }).click()
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await page.getByRole('button', { name: 'Open the dashboard' }).click()
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) {
    await page.getByRole('button', { name: 'Sign in with Passkey' }).click()
    await page
      .waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 20_000,
      })
      .catch(() => {})
  }
  const me = await (
    await page.request.get(`${WEBSITE}/_emdash/api/auth/me`)
  ).json()
  if (me.data?.role !== 50) throw new Error(`EmDash role ${me.data?.role}`)
  step('the owner is the website’s first EmDash Administrator')

  const home = await (await fetch(`${WEBSITE}/`)).text()
  if (!home.includes('Summer Church Picnic'))
    throw new Error('church blocks did not render published records')
  step('the website renders published Fellowship42 records')
  console.log(`\n${steps.length} steps passed.`)
} finally {
  await browser.close()
}
