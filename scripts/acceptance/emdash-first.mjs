#!/usr/bin/env node
/**
 * Acceptance: "EmDash-first setup". A separate EmDash 1.0.1 site installs the
 * packed @fellowship42/emdash integration, an EmDash Administrator connects it
 * to a Fellowship42 instance, and the site renders the same published records
 * as the public website contract. Also covers the EmDash-first access
 * boundaries and the church-content lifecycle on this path.
 *
 *   node scripts/acceptance/emdash-first.mjs [--instance-url URL] [--out FILE] [--keep]
 *     [--no-instance-build]
 *
 * Without --instance-url the script builds and runs its own isolated instance
 * (port 8797) from apps/instance; --no-instance-build reuses the existing
 * apps/instance/dist instead of rebuilding it (for example while another run
 * is serving that build). The EmDash site always runs on port 8799.
 * Every server it starts is stopped before it exits. Writes a JSON evidence
 * document (default /tmp/f42-acceptance/emdash-first.json) and exits non-zero
 * when any check fails.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  blockOf,
  churchBlocks,
  jsonLd,
  textContent,
} from './lib-emdash-first/html.mjs'
import {
  CHURCH_ID,
  Instance,
  readContract,
} from './lib-emdash-first/instance.mjs'
import { run, stopAll } from './lib-emdash-first/process.mjs'
import {
  ALLOW_PRIVATE_HOSTS,
  Site,
  describeStatusPage,
  sha256Hex,
} from './lib-emdash-first/site.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = path.join(repo, 'scripts/acceptance/fixtures/emdash-first-site')
const SITE_PORT = 8799
const INSTANCE_PORT = 8797
const PNPM = { command: 'npx', args: ['-y', 'pnpm@12.4.2'] }
const ROWS = {
  setup: 'EmDash-first setup',
  access: 'Access boundaries (EmDash-first)',
  lifecycle: 'Church-content lifecycle (EmDash-first)',
}
const MESSAGES = {
  unavailable:
    'Church information is temporarily unavailable. Please try again shortly.',
  wrongInstance: 'Church information is temporarily unavailable.',
  notConfigured: 'Church information will appear here soon.',
  invalidCursor:
    'That page of results is no longer available. Start again from the first page.',
}
const BANNERS = {
  connected: 'Connected to Fellowship42',
  invalidPin: 'The church identity pin is not a valid 64-character digest',
  privateHost: 'The Fellowship42 address is a local or private address',
}
const BLOCK_KINDS = [
  'church',
  'services',
  'events',
  'sermons',
  'groups',
  'courses',
]
// Display choices only: the page stores no church records.
const LISTS = [
  { kind: 'events', type: 'f42Events', heading: 'Upcoming events', limit: 3 },
  { kind: 'sermons', type: 'f42Sermons', heading: 'Recent sermons', limit: 3 },
  { kind: 'groups', type: 'f42Groups', heading: 'Groups', limit: 4 },
  { kind: 'courses', type: 'f42Courses', heading: 'Courses', limit: 2 },
]
const PAGE_SLUG = 'church'
const PAGE_CONTENT = [
  {
    _type: 'block',
    _key: 'intro',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 'intro-text',
        marks: [],
        text: 'Welcome to Riverside Church. The church details below come from Fellowship42.',
      },
    ],
  },
  {
    _type: 'f42ChurchInfo',
    _key: 'about',
    heading: 'About us',
    showAbout: true,
    showContact: true,
  },
  { _type: 'f42ServiceTimes', _key: 'services', heading: 'Service times' },
  ...LISTS.map((list) => ({
    _type: list.type,
    _key: list.kind,
    heading: list.heading,
    limit: list.limit,
    paginate: list.kind === 'sermons' || list.kind === 'events',
  })),
]

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    instanceUrl: null,
    out: '/tmp/f42-acceptance/emdash-first.json',
    keep: false,
    instanceBuild: true,
  }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    const value = () => {
      const next = argv[++index]
      if (!next || next.startsWith('--'))
        throw new Error(`${flag} needs a value`)
      return next
    }
    if (flag === '--instance-url') options.instanceUrl = value()
    else if (flag === '--out') options.out = path.resolve(value())
    else if (flag === '--keep') options.keep = true
    else if (flag === '--no-instance-build') options.instanceBuild = false
    else if (flag === '--help' || flag === '-h') options.help = true
    else throw new Error(`unknown argument ${flag}`)
  }
  if (options.instanceUrl) {
    const url = new URL(options.instanceUrl)
    if (url.origin !== options.instanceUrl.replace(/\/$/, ''))
      throw new Error(
        '--instance-url must be an origin, e.g. http://localhost:5173',
      )
    options.instanceUrl = url.origin
  }
  return options
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

class Evidence {
  constructor() {
    this.startedAt = new Date()
    this.checks = []
    this.timings = {}
    this.observations = []
  }

  record(row, id, title, pass, observed, extra = {}) {
    const check = {
      row: ROWS[row],
      id,
      title,
      result: pass === null ? 'skipped' : pass ? 'pass' : 'fail',
      ...extra,
      observed,
    }
    this.checks.push(check)
    const mark =
      check.result === 'pass'
        ? 'PASS'
        : check.result === 'fail'
          ? 'FAIL'
          : 'SKIP'
    console.log(`  ${mark}  ${id}  ${title}`)
    if (check.result === 'fail')
      console.log(`        observed: ${JSON.stringify(observed).slice(0, 600)}`)
    return check
  }

  /** Runs one check; an exception is a failed check, not an aborted run. */
  async check(row, id, title, body, { required = false } = {}) {
    let outcome
    try {
      outcome = await body()
    } catch (error) {
      outcome = { pass: false, observed: { error: error.message } }
    }
    const check = this.record(row, id, title, outcome.pass, outcome.observed)
    if (required && check.result !== 'pass')
      throw new Error(`required check failed: ${id}`)
    return outcome
  }

  skip(row, id, title, reason) {
    return this.record(row, id, title, null, { reason })
  }

  /** Starts a timed phase of checks (ending the previous one). */
  phase(name) {
    const now = Date.now()
    if (this.current)
      this.timings[this.current.name] = now - this.current.started
    this.current = name ? { name, started: now } : null
    if (name) console.log(`\n== ${name}`)
  }

  async step(name, body) {
    this.phase(null)
    const started = Date.now()
    console.log(`\n== ${name}`)
    try {
      return await body()
    } finally {
      this.timings[name] = Date.now() - started
    }
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// Rendering vs contract
// ---------------------------------------------------------------------------

async function renderedPage(anonymous, pathname = `/${PAGE_SLUG}`) {
  const response = await anonymous.get(pathname)
  if (response.status !== 200)
    throw new Error(`GET ${pathname} returned ${response.status}`)
  return { html: response.text, blocks: churchBlocks(response.text), response }
}

/** Compares each list block with the contract page it should show. */
async function compareLists(origin, blocks) {
  const results = {}
  for (const list of LISTS) {
    const contract = await readContract(
      origin,
      list.kind,
      `?limit=${list.limit}`,
    )
    const block = blocks.find((entry) => entry.kind === list.kind)
    const items = Array.isArray(contract.body?.items) ? contract.body.items : []
    const contractTitles = items.map((item) => item.title)
    results[list.kind] = {
      limit: list.limit,
      contractStatus: contract.status,
      contractIds: items.map((item) => item.id),
      contractTitles,
      renderedTitles: block?.titles ?? null,
      renderedHeading: block?.heading ?? null,
      // An error answer or an empty page would make "both empty" look equal;
      // a match needs the contract to have answered with records.
      match:
        contract.status === 200 &&
        contractTitles.length > 0 &&
        Boolean(block) &&
        same(block.titles, contractTitles),
    }
    if (list.kind === 'courses') {
      results.courses.contractUrls = items.map((item) => item.url)
      results.courses.renderedLinks = block?.links ?? null
      results.courses.match &&= same(block?.links, results.courses.contractUrls)
    }
    if (list.kind === 'sermons') {
      // Each sermon card carries its contract calendar date.
      results.sermons.contractDates = items.map((item) => item.preachedOn)
      results.sermons.renderedDates = block?.times ?? null
      results.sermons.match &&= same(
        block?.times,
        results.sermons.contractDates,
      )
    }
    if (list.kind === 'sermons' || list.kind === 'events') {
      results[list.kind].contractNextCursor = contract.body.nextCursor
      results[list.kind].renderedNextHref = block?.nextHref ?? null
    }
  }
  return results
}

function allUnavailable(blocks, message) {
  return BLOCK_KINDS.map((kind) => {
    const block = blocks.find((entry) => entry.kind === kind)
    return {
      kind,
      notice: block?.notice ?? null,
      tone: block?.noticeTone ?? null,
      titles: block?.titles ?? null,
      ok:
        Boolean(block) &&
        block.notice === message &&
        block.noticeTone === 'unavailable' &&
        block.titles.length === 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function gitDescribe() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
    const dirty =
      execFileSync('git', ['status', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim().length > 0
    return { commit, branch, dirty }
  } catch {
    return null
  }
}

/** Files of a directory tree, relative to it (node_modules excluded). */
function treeFiles(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name)
    if (entry.name === 'node_modules') return []
    return entry.isDirectory() ? treeFiles(directory, relative) : [relative]
  })
}

/**
 * Unpacks `tarball` and compares every file with the installed package
 * directory, so a workspace link or a registry copy cannot pass for it.
 */
function compareWithTarball(installed, tarball, scratch) {
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', scratch])
  const unpacked = path.join(scratch, 'package')
  const packed = treeFiles(unpacked).sort()
  const present = treeFiles(installed).sort()
  const differing = packed.filter(
    (file) =>
      !present.includes(file) ||
      sha256File(path.join(unpacked, file)) !==
        sha256File(path.join(installed, file)),
  )
  const extra = present.filter((file) => !packed.includes(file))
  rmSync(scratch, { recursive: true, force: true })
  return {
    files: packed.length,
    differing,
    extra,
    identical:
      packed.length > 0 && differing.length === 0 && extra.length === 0,
  }
}

/** Import specifiers used by the fixture site's own source files. */
function fixtureImports() {
  const specifiers = new Set()
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.(astro|ts|mjs|js)$/.test(entry.name))
        for (const match of readFileSync(file, 'utf8').matchAll(
          /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g,
        ))
          specifiers.add(match[1])
    }
  }
  walk(fixture)
  return [...specifiers].sort()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(
      'Usage: node scripts/acceptance/emdash-first.mjs [--instance-url URL] [--out FILE] [--keep] [--no-instance-build]',
    )
    return 0
  }
  const evidence = new Evidence()
  const root = '/tmp/f42-acceptance'
  mkdirSync(root, { recursive: true })
  const workDir = mkdtempSync(path.join(root, 'emdash-first-'))
  const logDir = path.join(workDir, 'logs')
  mkdirSync(logDir, { recursive: true })
  console.log(`EmDash-first acceptance. Work directory: ${workDir}`)

  const ownInstance = !options.instanceUrl
  const site = new Site({
    fixture,
    workDir,
    port: SITE_PORT,
    logDir,
    pnpm: PNPM,
    storeDir: path.join(root, 'pnpm-store'),
  })
  const instance = ownInstance
    ? new Instance({ repo, workDir, port: INSTANCE_PORT, logDir, pnpm: PNPM })
    : null
  const instanceOrigin = options.instanceUrl ?? instance.origin
  const doc = {
    acceptance: 'emdash-first',
    rows: Object.values(ROWS),
    startedAt: evidence.startedAt.toISOString(),
    repository: gitDescribe(),
    mode: ownInstance
      ? 'isolated instance started by this script'
      : 'external instance (--instance-url)',
    origins: { site: site.origin, instance: instanceOrigin },
    versions: { node: process.version },
    artifacts: {},
  }
  let aborted = null
  const cleanupErrors = []
  let signalled = false
  const onSignal = (signal) => {
    if (signalled) return
    signalled = true
    console.error(
      `\nReceived ${signal}; stopping servers. Work directory kept: ${workDir}`,
    )
    stopAll()
    process.exit(130)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.on('exit', stopAll)

  try {
    // 1. Pack the two npm packages exactly as consumers would receive them.
    const packs = path.join(workDir, 'packs')
    await evidence.step('pack npm packages', async () => {
      await run(PNPM.command, [...PNPM.args, 'build:contracts'], {
        cwd: repo,
        logFile: path.join(logDir, 'pack.log'),
      })
      for (const name of [
        '@fellowship42/website-contract',
        '@fellowship42/emdash',
      ])
        await run(
          PNPM.command,
          [...PNPM.args, '--filter', name, 'pack', '--pack-destination', packs],
          { cwd: repo, logFile: path.join(logDir, 'pack.log') },
        )
      doc.versions.pnpm = (
        await run(PNPM.command, [...PNPM.args, '--version'], { cwd: workDir })
      ).trim()
    })
    const tarballs = readdirSync(packs).map((name) => path.join(packs, name))
    const contractTarball = tarballs.find((file) =>
      path.basename(file).startsWith('fellowship42-website-contract-'),
    )
    const emdashTarball = tarballs.find((file) =>
      path.basename(file).startsWith('fellowship42-emdash-'),
    )
    doc.artifacts.tarballs = tarballs.map((file) => ({
      file: path.basename(file),
      bytes: statSync(file).size,
      sha256: sha256File(file),
    }))

    // 2. Scaffold, install, and build the independent site.
    await evidence.step(
      'scaffold, install, and build the EmDash site',
      async () => {
        const manifest = site.scaffold({ emdashTarball, contractTarball })
        await site.install()
        await site.build()
        await site.writeEnv()
        doc.versions.site = site.versions()
        doc.artifacts.sitePackageJson = {
          dependencies: manifest.dependencies,
          devDependencies: manifest.devDependencies,
        }
        try {
          const wranglerDir = path.dirname(
            realpathSync(
              path.join(site.dir, 'node_modules/wrangler/package.json'),
            ),
          )
          doc.versions.site.workerd = JSON.parse(
            readFileSync(
              createRequire(path.join(wranglerDir, 'package.json')).resolve(
                'workerd/package.json',
              ),
              'utf8',
            ),
          ).version
        } catch {
          doc.versions.site.workerd = null
        }
      },
    )

    await evidence.check(
      'setup',
      'setup.packed-integration-installed',
      'The site installs the packed npm tarballs, and the integration resolves its contract dependency to the packed tarball',
      () => {
        const emdashReal = realpathSync(
          path.join(site.dir, 'node_modules/@fellowship42/emdash'),
        )
        const contractFromEmdash = realpathSync(
          path.join(emdashReal, '../../@fellowship42/website-contract'),
        )
        const packedManifest = JSON.parse(
          readFileSync(path.join(emdashReal, 'package.json'), 'utf8'),
        )
        const observed = {
          installedEmdash: path.relative(site.dir, emdashReal),
          contractResolvedFromEmdash: path.relative(
            site.dir,
            contractFromEmdash,
          ),
          // Byte-for-byte: the installed trees are the tarballs' contents.
          emdashMatchesTarball: compareWithTarball(
            emdashReal,
            emdashTarball,
            path.join(workDir, 'unpacked-emdash'),
          ),
          contractMatchesTarball: compareWithTarball(
            contractFromEmdash,
            contractTarball,
            path.join(workDir, 'unpacked-contract'),
          ),
          packedDependency:
            packedManifest.dependencies['@fellowship42/website-contract'],
          versions: {
            '@fellowship42/emdash': doc.versions.site['@fellowship42/emdash'],
            '@fellowship42/website-contract':
              doc.versions.site['@fellowship42/website-contract'],
          },
        }
        return {
          pass:
            /@fellowship42\+emdash@file\+.*\.tgz/.test(emdashReal) &&
            /@fellowship42\+website-contract@file\+.*\.tgz/.test(
              contractFromEmdash,
            ) &&
            observed.emdashMatchesTarball.identical &&
            observed.contractMatchesTarball.identical &&
            !String(observed.packedDependency).startsWith('workspace:'),
          observed,
        }
      },
      { required: true },
    )

    await evidence.check(
      'setup',
      'setup.independent-site',
      'The site is an independent EmDash 1.0.1 site (upstream starter shape) that imports nothing from apps/website, registers the integration and the caching middleware as documented, and does not pin the connection (only the local-evaluation private-host opt-in is set)',
      () => {
        const imports = fixtureImports()
        const config = readFileSync(
          path.join(site.dir, 'astro.config.mjs'),
          'utf8',
        )
        const env = readFileSync(site.envFile, 'utf8')
        const wrangler = readFileSync(
          path.join(site.dir, 'dist/server/wrangler.json'),
          'utf8',
        )
        const observed = {
          imports,
          registersPlugin: /plugins:\s*\[\s*fellowship42\(\)\s*\]/.test(config),
          fellowship42Imports: imports.filter((name) =>
            name.startsWith('@fellowship42/'),
          ),
          connectionPinnedByEnvironment:
            /FELLOWSHIP42_(URL|INSTANCE_SHA256)=/.test(env) ||
            /FELLOWSHIP42_(URL|INSTANCE_SHA256)"/.test(wrangler),
          // The instance runs on localhost, which settings may name only
          // with the deployment's local-evaluation opt-in.
          allowPrivateHosts: new RegExp(
            `^${ALLOW_PRIVATE_HOSTS}=true$`,
            'm',
          ).test(env),
          cachingMiddleware: readFileSync(
            path.join(site.dir, 'src/middleware.ts'),
            'utf8',
          ).includes("headers.set('Cache-Control', 'no-cache')"),
          envKeys: env
            .split('\n')
            .filter(Boolean)
            .map((line) => line.split('=')[0]),
          emdash: doc.versions.site.emdash,
        }
        return {
          pass:
            observed.registersPlugin &&
            same(observed.fellowship42Imports, ['@fellowship42/emdash']) &&
            !imports.some((name) => /apps\/|\.\.\/\.\.\//.test(name)) &&
            !observed.connectionPinnedByEnvironment &&
            observed.allowPrivateHosts &&
            observed.cachingMiddleware &&
            observed.emdash === '1.0.1',
          observed,
        }
      },
    )

    // 3. The Fellowship42 instance.
    let digest
    if (ownInstance) {
      await evidence.step(
        'build and start an isolated Fellowship42 instance',
        async () => {
          await instance.build({ rebuild: options.instanceBuild })
          await instance.prepareState()
          await instance.start()
          doc.versions.instanceWrangler = JSON.parse(
            readFileSync(
              path.join(
                repo,
                'apps/instance/node_modules/wrangler/package.json',
              ),
              'utf8',
            ),
          ).version
        },
      )
    }
    const health = await (await fetch(`${instanceOrigin}/api/health`)).json()
    digest = health?.bootstrap?.portableIdentitySha256
    doc.instance = {
      origin: instanceOrigin,
      health: { status: health.status, bootstrap: health.bootstrap },
    }
    if (!/^[0-9a-f]{64}$/.test(digest ?? ''))
      throw new Error(
        `instance health did not report bootstrap.portableIdentitySha256: ${JSON.stringify(health)}`,
      )
    const descriptor = await readContract(instanceOrigin)
    doc.instance.descriptor = descriptor.body
    if (ownInstance) {
      await evidence.check(
        'lifecycle',
        'lifecycle.owner-signs-in-to-fellowship42',
        'A Fellowship42 owner enrolls a passkey through owner recovery and holds a staff session (used to publish, edit, withdraw, and delete records)',
        async () => {
          const session = await instance.enrollOwner()
          return {
            pass: session?.user?.email === 'owner@example.test',
            observed: { user: session?.user?.email ?? null },
          }
        },
        { required: true },
      )
      // Observed, not part of this row: the instance front door without a
      // configured website.
      const front = await fetch(`${instanceOrigin}/`, { redirect: 'manual' })
      evidence.observations.push({
        id: 'instance.homepage-without-website-origin',
        note: 'GET / on the instance with WEBSITE_ORIGIN unset (ADR 0027: "Without a configured website, the existing instance homepage stays available")',
        status: front.status,
        contentType: front.headers.get('content-type'),
        body: (await front.text()).slice(0, 300),
      })
    }

    // 4. The site's first Administrator through EmDash's normal setup.
    await evidence.step('start the EmDash site', () => site.start())
    evidence.phase('EmDash first-run setup and connection')
    const setup = await evidence.check(
      'setup',
      'setup.first-administrator',
      "EmDash's own setup creates the site's first Administrator with a passkey (no Fellowship42 claim on this path)",
      async () => {
        const result = await site.setupFirstAdministrator({
          title: 'Riverside Church',
          email: 'admin@riverside.example',
          name: 'Riverside Administrator',
        })
        const after = await site
          .client('probe')
          .get('/_emdash/api/setup/status')
        const observed = {
          before: {
            needsSetup: result.status.needsSetup,
            authMode: result.status.authMode,
          },
          user: result.user,
          rpId: result.rpId,
          after: {
            status: after.status,
            needsSetup: after.data?.data?.needsSetup,
          },
        }
        return {
          pass:
            result.status.needsSetup === true &&
            result.user?.role === 50 &&
            after.data?.data?.needsSetup === false,
          observed,
          result,
        }
      },
      { required: true },
    )
    const { admin, passkey: adminPasskey } = setup.result

    await evidence.check(
      'setup',
      'setup.administrator-signs-in',
      'The Administrator signs in with a passkey assertion and gets an authenticated EmDash session',
      async () => {
        const user = await site.signIn(admin, adminPasskey)
        const me = await admin.get('/_emdash/api/auth/me')
        return {
          pass: me.status === 200 && me.data?.data?.role === 50,
          observed: {
            signedIn: user,
            me: me.status,
            role: me.data?.data?.role,
          },
        }
      },
      { required: true },
    )

    await evidence.check(
      'setup',
      'setup.integration-registered',
      'EmDash loads the trusted integration: plugin "fellowship42" is enabled with its status page and the six church Portable Text blocks',
      async () => {
        const manifest = await admin.get('/_emdash/api/manifest')
        const plugin = manifest.data?.data?.plugins?.fellowship42
        const observed = {
          status: manifest.status,
          version: plugin?.version ?? null,
          enabled: plugin?.enabled ?? null,
          adminPages: plugin?.adminPages ?? null,
          blockTypes:
            plugin?.portableTextBlocks?.map((block) => block.type) ?? null,
          categories: [
            ...new Set(
              plugin?.portableTextBlocks?.map((block) => block.category),
            ),
          ],
        }
        return {
          pass:
            plugin?.enabled === true &&
            same(observed.blockTypes, [
              'f42ChurchInfo',
              'f42ServiceTimes',
              'f42Events',
              'f42Sermons',
              'f42Groups',
              'f42Courses',
            ]) &&
            observed.adminPages?.some((page) => page.path === '/status'),
          observed,
        }
      },
    )

    await evidence.check(
      'setup',
      'setup.initially-not-connected',
      'Before an Administrator connects it, the status page says "Not connected" and the connection is set by plugin settings',
      async () => {
        const status = describeStatusPage(await site.statusPage(admin))
        return {
          pass:
            status.status === 200 &&
            status.banner?.title === 'Not connected to Fellowship42' &&
            status.fields['Connection set by'] ===
              'Plugin settings (Administrators only)',
          observed: status,
        }
      },
    )

    const anonymous = site.client('anonymous visitor')
    anonymous.headers = { accept: 'text/html' }
    await evidence.check(
      'setup',
      'setup.page-with-church-blocks-published',
      'The Administrator creates and publishes a page whose Portable Text holds the six church blocks (display choices only)',
      async () => {
        const page = await site.createPublishedPage(admin, {
          slug: PAGE_SLUG,
          title: 'Our church',
          content: PAGE_CONTENT,
        })
        const stored = page.created.item?.data?.content ?? []
        const rendered = await renderedPage(anonymous)
        const observed = {
          id: page.id,
          status: page.published.item?.status ?? page.published.status ?? null,
          storedBlockTypes: stored.map((block) => block._type),
          storedFields: stored
            .filter((block) => block._type.startsWith('f42'))
            .map((block) =>
              Object.keys(block)
                .filter((key) => !key.startsWith('_'))
                .sort(),
            ),
          anonymousStatus: rendered.response.status,
          notConnectedNotices: rendered.blocks.map((block) => block.notice),
        }
        return {
          pass:
            rendered.blocks.length === 6 &&
            rendered.blocks.every(
              (block) => block.notice === MESSAGES.notConfigured,
            ) &&
            observed.storedFields
              .flat()
              .every((key) =>
                [
                  'heading',
                  'limit',
                  'paginate',
                  'showAbout',
                  'showContact',
                ].includes(key),
              ),
          observed,
        }
      },
      { required: true },
    )

    // 5. The Administrator connects the site in plugin settings.
    const connection = { instanceUrl: instanceOrigin, instanceSha256: digest }
    await evidence.check(
      'setup',
      'setup.administrator-connects',
      'The Administrator saves the Fellowship42 address and church identity digest in plugin settings',
      async () => {
        const put = await site.putSettings(admin, connection)
        const get = await site.settings(admin)
        return {
          pass: put.status === 200 && same(get.data?.data?.values, connection),
          observed: { put: put.status, values: get.data?.data?.values },
        }
      },
      { required: true },
    )

    await evidence.check(
      'setup',
      'setup.status-page-shows-connected-church',
      'The Fellowship42 status page confirms the connected church, its verified identity pin, the full copyable identity digest, and contract version 1, with the settings link for the Administrator',
      async () => {
        const status = describeStatusPage(await site.statusPage(admin))
        return {
          pass:
            status.banner?.title === BANNERS.connected &&
            status.fields.Church === descriptor.body.church?.name &&
            status.fields['Fellowship42 address'] === instanceOrigin &&
            status.fields['Identity pin'] ===
              'Set in plugin settings (verified)' &&
            status.digest === digest &&
            status.fields['Website contract'] === 'Version 1' &&
            status.actions.includes('Connection settings'),
          observed: { ...status, healthDigest: digest },
        }
      },
    )

    evidence.phase('rendering against the contract')
    // 6. The page renders the same records as the contract.
    let baseline
    let profileStrings = []
    await evidence.check(
      'setup',
      'setup.renders-church-profile',
      'Church information and service times render the contract church profile',
      async () => {
        const rendered = await renderedPage(anonymous)
        const church = (await readContract(instanceOrigin, 'church')).body
          .church
        const info = blockOf(rendered.html, 'church')
        const services = blockOf(rendered.html, 'services')
        const addressLine = [
          church.address.city,
          church.address.region,
          church.address.postalCode,
        ]
          .filter(Boolean)
          .join(', ')
        const observed = {
          contract: {
            name: church.name,
            tagline: church.tagline,
            summary: church.summary,
            street: church.address.street,
            addressLine,
            email: church.contact.email,
            serviceTimes: church.serviceTimes,
            timezone: church.timezone,
          },
          rendered: {
            churchText: info?.text ?? null,
            serviceTitles: services?.titles ?? null,
            serviceTimes: services?.times ?? null,
          },
        }
        const text = info?.text ?? ''
        // Profile strings the church block must show; kept for the
        // no-stale-content checks once the source is unusable.
        profileStrings = [
          church.tagline,
          church.summary,
          church.address.street,
          addressLine,
          church.contact.email,
          ...church.serviceTimes.map((time) => time.label),
        ].filter((value) => typeof value === 'string' && value.length > 0)
        return {
          pass:
            [
              church.tagline,
              church.summary,
              church.address.street,
              addressLine,
            ].every(
              (value) =>
                typeof value === 'string' &&
                value.length > 0 &&
                text.includes(value),
            ) &&
            (!church.contact.email || text.includes(church.contact.email)) &&
            church.serviceTimes.length > 0 &&
            same(
              services?.titles,
              church.serviceTimes.map((time) => time.label),
            ) &&
            same(
              services?.times,
              church.serviceTimes.map((time) => time.time),
            ),
          observed,
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.renders-same-records-as-contract',
      'Events, sermons, groups, and courses render exactly the contract records, in order, for each block limit',
      async () => {
        const rendered = await renderedPage(anonymous)
        const lists = await compareLists(instanceOrigin, rendered.blocks)
        baseline = { rendered, lists }
        return {
          pass: Object.values(lists).every((list) => list.match),
          observed: {
            ...lists,
            page: {
              status: rendered.response.status,
              cacheControl: rendered.response.headers.get('cache-control'),
              introRendered: textContent(rendered.html).includes(
                'Welcome to Riverside Church.',
              ),
            },
          },
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.renders-contract-paging',
      "A block's \"More\" link carries the contract's own next cursor, and the next page renders the contract's next page",
      async () => {
        const sermons = baseline.lists.sermons
        const href = sermons.renderedNextHref
        const cursor = href
          ? new URL(href, site.origin).searchParams.get('f42-sermons')
          : null
        const page2 = cursor
          ? await readContract(
              instanceOrigin,
              'sermons',
              `?limit=3&cursor=${encodeURIComponent(cursor)}`,
            )
          : null
        const rendered = href ? await renderedPage(anonymous, href) : null
        const renderedTitles = rendered
          ? blockOf(rendered.html, 'sermons')?.titles
          : null
        const contractTitles =
          page2?.body.items?.map((item) => item.title) ?? null
        return {
          pass:
            Boolean(cursor) &&
            cursor === sermons.contractNextCursor &&
            same(renderedTitles, contractTitles) &&
            contractTitles.length > 0,
          observed: {
            href,
            contractNextCursor: sermons.contractNextCursor,
            page2ContractTitles: contractTitles,
            page2RenderedTitles: renderedTitles,
          },
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.invalid-cursor-offers-first-page',
      'A rejected page cursor shows the "start again" notice with a working "First page" link, and only in that block',
      async () => {
        const param = 'f42-sermons'
        const rendered = await renderedPage(
          anonymous,
          `/${PAGE_SLUG}?${param}=not-a-cursor`,
        )
        const sermons = blockOf(rendered.html, 'sermons')
        const events = blockOf(rendered.html, 'events')
        const first = sermons?.firstHref
          ? await renderedPage(anonymous, sermons.firstHref)
          : null
        const firstTitles = first
          ? blockOf(first.html, 'sermons')?.titles
          : null
        return {
          pass:
            sermons?.notice === MESSAGES.invalidCursor &&
            sermons.firstHref === `/${PAGE_SLUG}` &&
            same(firstTitles, baseline.lists.sermons.contractTitles) &&
            same(events?.titles, baseline.lists.events.contractTitles),
          observed: {
            notice: sermons?.notice ?? null,
            firstHref: sermons?.firstHref ?? null,
            firstPageTitles: firstTitles,
            eventsTitles: events?.titles ?? null,
          },
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.pages-not-cached',
      'Pages with church blocks are served with Cache-Control: no-cache by the documented middleware recipe',
      async () => {
        const rendered = await renderedPage(anonymous)
        const cacheControl = rendered.response.headers.get('cache-control')
        return {
          pass: cacheControl === 'no-cache',
          observed: { cacheControl },
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.block-headings-labelled',
      'Every church block section is labelled by its own, unique heading id',
      async () => {
        const { blocks } = await renderedPage(anonymous)
        const ids = blocks.map((block) => block.headingId)
        return {
          pass:
            blocks.length === 6 &&
            new Set(ids).size === ids.length &&
            blocks.every(
              (block) =>
                block.headingId && block.labelledBy === block.headingId,
            ),
          observed: blocks.map((block) => ({
            kind: block.kind,
            headingId: block.headingId,
            labelledBy: block.labelledBy,
          })),
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.structured-data',
      "The home page carries the integration's schema.org Church data from the contract",
      async () => {
        const home = await anonymous.get('/')
        const church = jsonLd(home.text).flatMap((doc) =>
          (Array.isArray(doc['@graph']) ? doc['@graph'] : [doc]).filter(
            (node) => node['@type'] === 'Church',
          ),
        )[0]
        return {
          pass:
            home.status === 200 &&
            church?.name === descriptor.body.church?.name,
          observed: { status: home.status, church: church ?? null },
        }
      },
    )
    await evidence.check(
      'setup',
      'setup.contract-guarantees-observed',
      'The contract the site reads is anonymous, no-store, and readable from any origin',
      async () => {
        const events = await readContract(instanceOrigin, 'events', '?limit=1')
        return {
          pass:
            events.headers.cacheControl?.includes('no-store') &&
            events.headers.accessControlAllowOrigin === '*' &&
            events.body.contract === 'fellowship42-website' &&
            events.body.version === 1 &&
            events.body.instance.portableIdentitySha256 === digest,
          observed: {
            headers: events.headers,
            envelope: {
              contract: events.body.contract,
              version: events.body.version,
              instance: events.body.instance,
            },
          },
        }
      },
    )

    evidence.phase('access boundaries')
    // 7. Access boundaries.
    await evidence.check(
      'access',
      'access.anonymous-cannot-change-connection',
      'An unauthenticated request cannot change the connection settings',
      async () => {
        const visitor = site.client('anonymous writer')
        const put = await site.putSettings(visitor, {
          instanceUrl: 'https://attacker.example',
          instanceSha256: 'a'.repeat(64),
        })
        const after = await site.settings(admin)
        return {
          pass:
            [401, 403].includes(put.status) &&
            same(after.data?.data?.values, connection),
          observed: {
            status: put.status,
            error: put.data?.error ?? null,
            valuesAfter: after.data?.data?.values,
          },
        }
      },
    )
    const editorInvite = await evidence.check(
      'access',
      'access.editor-invited',
      'The Administrator invites an Editor with a copyable invite link (no email provider); the Editor accepts with a second passkey',
      async () => {
        const invited = await site.inviteAndAccept(admin, {
          email: 'editor@riverside.example',
          name: 'Riverside Editor',
          role: 40,
        })
        const me = await invited.client.get('/_emdash/api/auth/me')
        const manifest = await invited.client.get('/_emdash/api/manifest')
        const blocks =
          manifest.data?.data?.plugins?.fellowship42?.portableTextBlocks
            ?.length ?? 0
        return {
          pass:
            invited.user?.role === 40 &&
            me.status === 200 &&
            me.data?.data?.role === 40 &&
            blocks === 6,
          observed: {
            inviteUrl: invited.inviteUrl,
            accepted: invited.accepted,
            user: invited.user,
            me: me.status,
            churchBlocksAvailableToEditor: blocks,
          },
          result: invited,
        }
      },
      { required: true },
    )
    const editor = editorInvite.result
    await evidence.check(
      'access',
      'access.editor-cannot-change-connection',
      'An Editor cannot change the Fellowship42 connection',
      async () => {
        const put = await site.putSettings(editor.client, {
          instanceUrl: 'https://attacker.example',
          instanceSha256: 'b'.repeat(64),
        })
        const get = await site.settings(editor.client)
        const after = await site.settings(admin)
        return {
          pass:
            put.status === 403 && same(after.data?.data?.values, connection),
          observed: {
            put: put.status,
            error: put.data?.error ?? null,
            editorReadsSettings: get.status,
            valuesAfter: after.data?.data?.values,
          },
        }
      },
    )
    await evidence.check(
      'access',
      'access.editor-reads-status-page',
      'An Editor can open the Fellowship42 status page to see where content is edited, without the Administrator-only settings link',
      async () => {
        const status = describeStatusPage(await site.statusPage(editor.client))
        return {
          pass:
            status.status === 200 &&
            status.banner?.title === BANNERS.connected &&
            status.digest === digest &&
            !status.actions.includes('Connection settings'),
          observed: status,
        }
      },
    )
    await evidence.check(
      'access',
      'access.contributor-reads-status-page',
      'A Contributor, who can insert church blocks, can open the status page (content:create), without the settings link',
      async () => {
        const invited = await site.inviteAndAccept(admin, {
          email: 'contributor@riverside.example',
          name: 'Riverside Contributor',
          role: 20,
        })
        const status = describeStatusPage(await site.statusPage(invited.client))
        return {
          pass:
            invited.user?.role === 20 &&
            status.status === 200 &&
            status.banner?.title === BANNERS.connected &&
            !status.actions.includes('Connection settings'),
          observed: { role: invited.user?.role ?? null, status },
        }
      },
    )
    await evidence.check(
      'access',
      'access.emdash-account-has-no-fellowship42-access',
      'EmDash sessions confer no Fellowship42 staff access',
      async () => {
        const headers = {
          cookie: admin.cookieHeader,
          accept: 'application/json',
        }
        const session = await fetch(`${instanceOrigin}/api/session`, {
          headers,
        })
        const sermons = await fetch(
          `${instanceOrigin}/api/sermons/${CHURCH_ID}`,
          {
            headers,
          },
        )
        const body = await session.json()
        return {
          pass: body.user === null && [401, 403].includes(sermons.status),
          observed: { session: body, staffSermons: sermons.status },
        }
      },
    )
    await evidence.check(
      'access',
      'access.role-removal-stops-access',
      "Removing the Editor role (demoted to Subscriber) refuses the Editor's next status-page request",
      async () => {
        const demote = await admin.put(
          `/_emdash/api/admin/users/${editor.user.id}`,
          {
            role: 10,
          },
        )
        const status = await site.statusPage(editor.client)
        const me = await editor.client.get('/_emdash/api/auth/me')
        return {
          pass:
            demote.status === 200 &&
            status.status === 403 &&
            me.data?.data?.role === 10,
          observed: {
            demote: demote.status,
            nextStatusPage: status.status,
            error: status.data?.error ?? null,
            roleAfter: me.data?.data?.role ?? null,
          },
        }
      },
    )
    await evidence.check(
      'access',
      'access.disabled-user-refused',
      "Disabling the Editor ends the Editor's access on the next request",
      async () => {
        const disable = await admin.post(
          `/_emdash/api/admin/users/${editor.user.id}/disable`,
          {},
        )
        const me = await editor.client.get('/_emdash/api/auth/me')
        const status = await site.statusPage(editor.client)
        return {
          pass:
            disable.status === 200 &&
            [401, 403].includes(me.status) &&
            [401, 403].includes(status.status),
          observed: {
            disable: disable.status,
            nextMe: me.status,
            nextStatusPage: status.status,
            error: me.data?.error ?? null,
          },
        }
      },
    )

    evidence.phase('church-content lifecycle')
    // 8. Church-content lifecycle.
    const titlesOn = async (kind) =>
      blockOf((await renderedPage(anonymous)).html, kind)?.titles ?? null
    const contractIds = async (resource, limit) =>
      (
        await readContract(instanceOrigin, resource, `?limit=${limit}`)
      ).body.items.map((item) => item.id)
    const runTag = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    if (ownInstance) {
      let sermon
      const sermonTitle = `Acceptance sermon ${runTag}`
      await evidence.check(
        'lifecycle',
        'lifecycle.publish-visible',
        'A sermon published in Fellowship42 appears on the next page load',
        async () => {
          sermon = await instance.createSermon({
            slug: `acceptance-sermon-${runTag}`,
            title: sermonTitle,
            status: 'published',
            speaker: 'Acceptance Speaker',
            series: 'Acceptance',
            summary: 'Published by the EmDash-first acceptance run.',
            preachedAt: Date.now(),
          })
          const titles = await titlesOn('sermons')
          const ids = await contractIds('sermons', 3)
          return {
            pass: titles?.[0] === sermonTitle && ids[0] === sermon.id,
            observed: {
              sermonId: sermon.id,
              contractIds: ids,
              renderedTitles: titles,
            },
          }
        },
      )
      await evidence.check(
        'lifecycle',
        'lifecycle.edit-visible',
        'Editing the sermon title in Fellowship42 changes it on the next page load',
        async () => {
          sermon = await instance.updateSermon(sermon, {
            title: `${sermonTitle} (edited)`,
          })
          const titles = await titlesOn('sermons')
          return {
            pass:
              titles?.[0] === `${sermonTitle} (edited)` &&
              !titles.includes(sermonTitle),
            observed: { renderedTitles: titles },
          }
        },
      )
      await evidence.check(
        'lifecycle',
        'lifecycle.withdraw-removes',
        'Withdrawing the sermon (back to draft) removes it on the next page load',
        async () => {
          sermon = await instance.updateSermon(sermon, { status: 'draft' })
          const titles = await titlesOn('sermons')
          const ids = await contractIds('sermons', 100)
          return {
            pass:
              !titles.some((title) => title.startsWith(sermonTitle)) &&
              !ids.includes(sermon.id),
            observed: {
              renderedTitles: titles,
              inContract: ids.includes(sermon.id),
            },
          }
        },
      )
      await evidence.check(
        'lifecycle',
        'lifecycle.delete-removes',
        'Deleting a published sermon removes it on the next page load',
        async () => {
          sermon = await instance.updateSermon(sermon, { status: 'published' })
          const republished = await titlesOn('sermons')
          await instance.deleteSermon(sermon)
          const titles = await titlesOn('sermons')
          const ids = await contractIds('sermons', 100)
          return {
            pass:
              republished[0] === `${sermonTitle} (edited)` &&
              !titles.some((title) => title.startsWith(sermonTitle)) &&
              !ids.includes(sermon.id),
            observed: {
              renderedAfterRepublish: republished,
              renderedAfterDelete: titles,
              inContract: ids.includes(sermon.id),
            },
          }
        },
      )
      await evidence.check(
        'lifecycle',
        'lifecycle.event-publish-and-delete',
        'An event published in Fellowship42 appears on the next load and disappears once deleted',
        async () => {
          const startsAt = Date.now() + 24 * 60 * 60 * 1000
          const event = await instance.createEvent({
            slug: `acceptance-event-${runTag}`,
            title: `Acceptance event ${runTag}`,
            status: 'published',
            summary: 'Published by the EmDash-first acceptance run.',
            startsAt,
            endsAt: startsAt + 2 * 60 * 60 * 1000,
            timezone: 'America/New_York',
            location: 'Fellowship Hall',
          })
          const shown = await titlesOn('events')
          await instance.deleteEvent(event)
          const after = await titlesOn('events')
          return {
            pass: shown?.[0] === event.title && !after.includes(event.title),
            observed: {
              eventId: event.id,
              renderedWhilePublished: shown,
              renderedAfterDelete: after,
            },
          }
        },
      )
    } else {
      for (const [id, title] of [
        [
          'lifecycle.publish-visible',
          'Publish is visible on the next page load',
        ],
        ['lifecycle.edit-visible', 'Edit is visible on the next page load'],
        [
          'lifecycle.withdraw-removes',
          'Withdraw removes the record on the next page load',
        ],
        [
          'lifecycle.delete-removes',
          'Delete removes the record on the next page load',
        ],
        [
          'lifecycle.event-publish-and-delete',
          'An event published in Fellowship42 appears on the next load and disappears once deleted',
        ],
      ])
        evidence.skip(
          'lifecycle',
          id,
          title,
          'needs the isolated instance (run without --instance-url)',
        )
    }

    // Everything the connected page showed: list titles and profile text.
    const everyTitle = [
      ...Object.values(baseline?.lists ?? {}).flatMap(
        (list) => list.contractTitles,
      ),
      ...profileStrings,
    ]
    await evidence.check(
      'lifecycle',
      'lifecycle.unavailable-source',
      'When Fellowship42 is unreachable every church block shows the "temporarily unavailable" notice and no stale records',
      async () => {
        if (ownInstance) await instance.stop()
        else
          expectOk(
            await site.putSettings(admin, {
              ...connection,
              instanceUrl: 'http://127.0.0.1:9',
            }),
          )
        try {
          const rendered = await renderedPage(anonymous)
          const blocks = allUnavailable(rendered.blocks, MESSAGES.unavailable)
          const visible = textContent(rendered.html)
          const stale = everyTitle.filter((title) => visible.includes(title))
          const status = describeStatusPage(await site.statusPage(admin))
          return {
            pass:
              blocks.every((block) => block.ok) &&
              everyTitle.length > 0 &&
              stale.length === 0 &&
              status.banner?.title === 'Fellowship42 is not responding',
            observed: {
              how: ownInstance
                ? 'instance stopped'
                : 'address pointed at a closed port',
              blocks,
              staleCandidatesChecked: everyTitle.length,
              staleTitles: stale,
              statusPage: status.banner,
            },
          }
        } finally {
          if (ownInstance) await instance.start()
          else await site.putSettings(admin, connection)
        }
      },
    )
    await evidence.check(
      'lifecycle',
      'lifecycle.recovers',
      'When Fellowship42 answers again, the next page load renders the contract records again',
      async () => {
        const rendered = await renderedPage(anonymous)
        const lists = await compareLists(instanceOrigin, rendered.blocks)
        return {
          pass: Object.values(lists).every((list) => list.match),
          observed: Object.fromEntries(
            Object.entries(lists).map(([kind, list]) => [
              kind,
              list.renderedTitles,
            ]),
          ),
        }
      },
    )
    await evidence.check(
      'lifecycle',
      'lifecycle.wrong-church',
      'A connection pinned to another church identity shows the notice on the page and "different church" on the status page',
      async () => {
        const otherDigest = sha256Hex(
          'instance_00000000-0000-4000-8000-000000000000',
        )
        const put = await site.putSettings(admin, {
          ...connection,
          instanceSha256: otherDigest,
        })
        try {
          const rendered = await renderedPage(anonymous)
          const blocks = allUnavailable(rendered.blocks, MESSAGES.wrongInstance)
          const visible = textContent(rendered.html)
          const stale = everyTitle.filter((title) => visible.includes(title))
          const status = describeStatusPage(await site.statusPage(admin))
          return {
            pass:
              put.status === 200 &&
              blocks.every((block) => block.ok) &&
              everyTitle.length > 0 &&
              stale.length === 0 &&
              status.banner?.title ===
                'Connected to a different church than expected',
            observed: {
              pinned: otherDigest,
              blocks,
              staleCandidatesChecked: everyTitle.length,
              staleTitles: stale,
              statusPage: status.banner,
            },
          }
        } finally {
          await site.putSettings(admin, connection)
        }
      },
    )
    await evidence.check(
      'lifecycle',
      'lifecycle.malformed-identity-pin',
      'A shortened identity pin is reported as its own state, the status page still shows the full digest to copy, and blocks show the unavailable notice',
      async () => {
        const prefix = `${digest.slice(0, 16)}…`
        const put = await site.putSettings(admin, {
          ...connection,
          instanceSha256: prefix,
        })
        try {
          const status = describeStatusPage(await site.statusPage(admin))
          const rendered = await renderedPage(anonymous)
          const blocks = allUnavailable(rendered.blocks, MESSAGES.unavailable)
          const visible = textContent(rendered.html)
          const stale = everyTitle.filter((title) => visible.includes(title))
          return {
            pass:
              put.status === 200 &&
              status.banner?.title === BANNERS.invalidPin &&
              status.fields['Identity pin'] ===
                'Set in plugin settings (not a valid digest)' &&
              status.digest === digest &&
              blocks.every((block) => block.ok) &&
              stale.length === 0,
            observed: {
              pinned: prefix,
              statusPage: status,
              blocks,
              staleTitles: stale,
            },
          }
        } finally {
          await site.putSettings(admin, connection)
        }
      },
    )
    await evidence.check(
      'lifecycle',
      'lifecycle.restored-connection',
      'Restoring the correct identity renders the church records again',
      async () => {
        const rendered = await renderedPage(anonymous)
        const lists = await compareLists(instanceOrigin, rendered.blocks)
        const status = describeStatusPage(await site.statusPage(admin))
        return {
          pass:
            Object.values(lists).every((list) => list.match) &&
            status.banner?.title === BANNERS.connected,
          observed: {
            statusPage: status.banner,
            lists: Object.fromEntries(
              Object.entries(lists).map(([kind, list]) => [
                kind,
                list.renderedTitles,
              ]),
            ),
          },
        }
      },
    )
    // Last: restarts the site without the local-evaluation opt-in.
    const localInstance = ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(instanceOrigin).hostname,
    )
    if (localInstance)
      await evidence.check(
        'access',
        'access.private-address-refused',
        'Without the deployment opt-in, the production build refuses the local Fellowship42 address from plugin settings: the status page explains why and blocks show the unavailable notice',
        async () => {
          await site.stop()
          site.setAllowPrivateHosts(false)
          await site.start()
          const env = readFileSync(site.envFile, 'utf8')
          const status = describeStatusPage(await site.statusPage(admin))
          const rendered = await renderedPage(anonymous)
          const blocks = allUnavailable(rendered.blocks, MESSAGES.unavailable)
          const visible = textContent(rendered.html)
          const stale = everyTitle.filter((title) => visible.includes(title))
          return {
            pass:
              !env.includes(ALLOW_PRIVATE_HOSTS) &&
              status.status === 200 &&
              status.banner?.title === BANNERS.privateHost &&
              String(status.banner?.description).includes(
                `${ALLOW_PRIVATE_HOSTS}=true`,
              ) &&
              blocks.every((block) => block.ok) &&
              stale.length === 0,
            observed: {
              instanceUrlSetting: instanceOrigin,
              statusPage: status.banner,
              blocks,
              staleTitles: stale,
            },
          }
        },
      )
    else
      evidence.skip(
        'access',
        'access.private-address-refused',
        'Without the deployment opt-in, a local Fellowship42 address from plugin settings is refused',
        'needs a local instance address',
      )
  } catch (error) {
    aborted = error
    console.error(`\nRun aborted: ${error.stack ?? error.message}`)
  } finally {
    await evidence.step('stop servers', async () => {
      // A server that will not stop is a failed run, not a silent leftover.
      for (const [name, server] of [
        ['EmDash site', site],
        ['Fellowship42 instance', instance],
      ])
        if (server)
          await server.stop().catch((error) => {
            cleanupErrors.push(`${name}: ${error.message}`)
          })
      stopAll()
      for (const error of cleanupErrors)
        console.error(`  cleanup failed: ${error}`)
    })
  }

  // 9. Evidence.
  const failed = evidence.checks.filter((check) => check.result === 'fail')
  const passed = evidence.checks.filter((check) => check.result === 'pass')
  const skipped = evidence.checks.filter((check) => check.result === 'skipped')
  const ok =
    !aborted &&
    cleanupErrors.length === 0 &&
    failed.length === 0 &&
    passed.length > 0
  const finishedAt = new Date()
  const byRow = Object.fromEntries(
    Object.values(ROWS).map((row) => {
      const checks = evidence.checks.filter((check) => check.row === row)
      return [
        row,
        {
          result:
            checks.length === 0
              ? 'not-run'
              : checks.some((check) => check.result === 'fail')
                ? 'fail'
                : checks.every((check) => check.result === 'skipped')
                  ? 'skipped'
                  : checks.some((check) => check.result === 'skipped')
                    ? 'partial'
                    : 'pass',
          passed: checks.filter((check) => check.result === 'pass').length,
          failed: checks.filter((check) => check.result === 'fail').length,
          skipped: checks.filter((check) => check.result === 'skipped').length,
        },
      ]
    }),
  )
  Object.assign(doc, {
    result: ok ? 'pass' : 'fail',
    // False when checks were skipped (for example with --instance-url).
    complete: ok && skipped.length === 0,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - evidence.startedAt,
    summary: {
      checks: evidence.checks.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      byRow,
      aborted: aborted ? aborted.message : null,
      cleanupErrors,
    },
    timingsMs: evidence.timings,
    checks: evidence.checks,
    observations: evidence.observations,
    workDirectory: options.keep || !ok ? workDir : null,
  })
  mkdirSync(path.dirname(options.out), { recursive: true })
  writeFileSync(options.out, `${JSON.stringify(doc, null, 2)}\n`)

  console.log(
    `\nEmDash-first acceptance: ${ok ? 'PASS' : 'FAIL'}${ok && skipped.length > 0 ? ` (incomplete: ${skipped.length} skipped)` : ''}`,
  )
  for (const [row, summary] of Object.entries(byRow))
    console.log(
      `  ${row}: ${summary.result} (${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped)`,
    )
  for (const observation of evidence.observations)
    console.log(`  observation ${observation.id}: HTTP ${observation.status}`)
  console.log(
    `  duration ${(doc.durationMs / 1000).toFixed(1)} s; evidence ${options.out}`,
  )
  if (options.keep || !ok) console.log(`  work directory kept: ${workDir}`)
  else rmSync(workDir, { recursive: true, force: true })
  return ok ? 0 : 1
}

function expectOk(response) {
  if (response.status !== 200)
    throw new Error(
      `unexpected HTTP ${response.status}: ${response.text.slice(0, 300)}`,
    )
  return response
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error.stack ?? error.message)
    stopAll()
    process.exitCode = 1
  })
