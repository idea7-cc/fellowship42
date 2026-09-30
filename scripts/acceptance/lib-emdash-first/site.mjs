import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { Client, expectStatus } from './http.mjs'
import {
  Server,
  childEnv,
  freePort,
  portInUse,
  run,
  waitForPortFree,
} from './process.mjs'
import { SoftPasskey } from './soft-passkey.mjs'

/**
 * The independent EmDash site: the repository fixture copied to a temporary
 * directory, installed from the packed npm tarballs, built with `astro build`,
 * and served as the production build by `wrangler dev`.
 */

export const PLUGIN_ID = 'fellowship42'
const EMDASH = { 'X-EmDash-Request': '1', accept: 'application/json' }

export class Site {
  constructor({ fixture, workDir, port, logDir, pnpm, storeDir }) {
    this.fixture = fixture
    this.dir = path.join(workDir, 'site')
    this.state = path.join(workDir, 'site-state')
    this.port = port
    this.origin = `http://localhost:${port}`
    this.logDir = logDir
    this.pnpm = pnpm
    this.storeDir = storeDir
    this.env = childEnv({
      WRANGLER_REGISTRY_PATH: path.join(workDir, 'wrangler-registry'),
      WRANGLER_LOG_PATH: path.join(logDir, 'wrangler-site-logs'),
    })
    this.server = null
  }

  log(name) {
    return path.join(this.logDir, name)
  }

  scaffold({ emdashTarball, contractTarball }) {
    rmSync(this.dir, { recursive: true, force: true })
    cpSync(this.fixture, this.dir, {
      recursive: true,
      filter: (source) =>
        !/[\\/](node_modules|dist|\.astro|\.wrangler|\.emdash)([\\/]|$)/.test(
          path.relative(this.fixture, source),
        ),
    })
    const fill = (file) => {
      const target = path.join(this.dir, file)
      const text = readFileSync(target, 'utf8')
        .replaceAll('__F42_EMDASH_TARBALL__', emdashTarball)
        .replaceAll('__F42_WEBSITE_CONTRACT_TARBALL__', contractTarball)
        .replaceAll('__PNPM_STORE_DIR__', this.storeDir)
      if (text.includes('__'))
        throw new Error(`unfilled placeholder in ${file}`)
      writeFileSync(target, text)
      return text
    }
    fill('pnpm-workspace.yaml')
    const manifest = fill('package.json')
    return JSON.parse(manifest)
  }

  async install() {
    await run(this.pnpm.command, [...this.pnpm.args, 'install'], {
      cwd: this.dir,
      env: this.env,
      logFile: this.log('site-install.log'),
      timeoutMs: 15 * 60_000,
    })
  }

  bin(name) {
    return path.join(this.dir, 'node_modules', '.bin', name)
  }

  async build() {
    await run(this.bin('astro'), ['build'], {
      cwd: this.dir,
      env: this.env,
      logFile: this.log('site-build.log'),
    })
    if (!existsSync(path.join(this.dir, 'dist/server/wrangler.json')))
      throw new Error('astro build did not produce dist/server/wrangler.json')
  }

  /** Secrets and deployment variables, as a site operator would set them. */
  async writeEnv() {
    this.envFile = path.join(this.dir, '..', 'site.env')
    rmSync(this.envFile, { force: true })
    await run(
      this.bin('emdash'),
      ['secrets', 'generate', '--write', this.envFile],
      { cwd: this.dir, env: this.env, logFile: this.log('site-secrets.log') },
    )
    const written = readFileSync(this.envFile, 'utf8')
    if (!/^EMDASH_ENCRYPTION_KEY=emdash_enc_v1_/m.test(written))
      throw new Error('emdash secrets generate did not write a key')
    // Only the public site URL; the Fellowship42 connection is not pinned.
    appendFileSync(this.envFile, `EMDASH_SITE_URL=${this.origin}\n`)
  }

  versions() {
    const read = (name) => {
      try {
        return JSON.parse(
          readFileSync(
            path.join(this.dir, 'node_modules', name, 'package.json'),
            'utf8',
          ),
        ).version
      } catch {
        return null
      }
    }
    return Object.fromEntries(
      [
        'emdash',
        '@emdash-cms/cloudflare',
        'astro',
        '@astrojs/cloudflare',
        '@astrojs/react',
        'react',
        'react-dom',
        'wrangler',
        '@fellowship42/emdash',
        '@fellowship42/website-contract',
      ].map((name) => [name, read(name)]),
    )
  }

  async start() {
    if (await portInUse(this.port))
      throw new Error(
        `port ${this.port} is already in use; stop whatever is listening there`,
      )
    const inspector = await freePort()
    this.server = new Server(
      'EmDash site',
      this.bin('wrangler'),
      [
        'dev',
        '--config',
        'dist/server/wrangler.json',
        '--port',
        String(this.port),
        '--ip',
        'localhost',
        '--persist-to',
        this.state,
        '--env-file',
        this.envFile,
        '--inspector-port',
        String(inspector),
        '--show-interactive-dev-session=false',
      ],
      { cwd: this.dir, env: this.env, logFile: this.log('site-server.log') },
    ).start()
    await this.server.waitUntil(async () => {
      const response = await fetch(`${this.origin}/_emdash/api/setup/status`, {
        signal: AbortSignal.timeout(15_000),
      })
      return response.status === 200
    })
  }

  async stop() {
    await this.server?.stop()
    this.server = null
    await waitForPortFree(this.port)
  }

  /** A browser profile for this site. */
  client(label) {
    return new Client(this.origin, { label, headers: EMDASH })
  }

  /** EmDash's own first-run setup: site step, then the first Administrator's passkey. */
  async setupFirstAdministrator({ title, email, name }) {
    const admin = this.client('administrator')
    const passkey = new SoftPasskey('EmDash administrator')
    const status = expectStatus(
      await admin.get('/_emdash/api/setup/status'),
      200,
      'setup status',
    ).data.data
    expectStatus(
      await admin.post('/_emdash/api/setup', {
        title,
        tagline: 'An EmDash site the church already runs',
        includeContent: false,
      }),
      200,
      'setup site step',
    )
    const start = expectStatus(
      await admin.post('/_emdash/api/setup/admin', { email, name }),
      200,
      'setup admin step',
    ).data.data
    const verify = expectStatus(
      await admin.post('/_emdash/api/setup/admin/verify', {
        credential: passkey.create(start.options, this.origin),
      }),
      200,
      'setup admin passkey',
    ).data.data
    admin.cookies.clear()
    return {
      admin,
      passkey,
      status,
      user: verify.user,
      rpId: start.options.rp.id,
    }
  }

  /** Passkey sign-in through EmDash's login ceremony. */
  async signIn(client, passkey) {
    const options = expectStatus(
      await client.post('/_emdash/api/auth/passkey/options', {}),
      200,
      'passkey options',
    ).data.data.options
    const verified = expectStatus(
      await client.post('/_emdash/api/auth/passkey/verify', {
        credential: passkey.get(options, this.origin),
      }),
      200,
      'passkey sign-in',
    ).data.data
    return verified.user
  }

  /** Invite by copyable link (no email provider), accepted with a second passkey. */
  async inviteAndAccept(admin, { email, name, role }) {
    const invite = expectStatus(
      await admin.post('/_emdash/api/auth/invite', { email, role }),
      200,
      'create invite',
    ).data.data
    const token = new URL(invite.inviteUrl).searchParams.get('token')
    if (!token) throw new Error(`invite URL has no token: ${invite.inviteUrl}`)
    const invitee = this.client(`invitee-${role}`)
    const passkey = new SoftPasskey(`EmDash invitee (${role})`)
    const accepted = expectStatus(
      await invitee.get(
        `/_emdash/api/auth/invite/accept?token=${encodeURIComponent(token)}`,
      ),
      200,
      'validate invite',
    ).data.data
    const options = expectStatus(
      await invitee.post('/_emdash/api/auth/invite/register-options', {
        token,
        name,
      }),
      200,
      'invite passkey options',
    ).data.data.options
    const completed = expectStatus(
      await invitee.post('/_emdash/api/auth/invite/complete', {
        token,
        name,
        credential: passkey.create(options, this.origin),
      }),
      200,
      'complete invite',
    ).data.data
    return {
      client: invitee,
      passkey,
      inviteUrl: invite.inviteUrl.replace(/token=[^&]+/, 'token=<redacted>'),
      accepted,
      user: completed.user,
    }
  }

  settings(client) {
    return client.get(`/_emdash/api/admin/plugins/${PLUGIN_ID}/settings`)
  }

  putSettings(client, values) {
    return client.put(`/_emdash/api/admin/plugins/${PLUGIN_ID}/settings`, {
      values,
    })
  }

  /** The integration's Block Kit status page, as the admin UI loads it. */
  statusPage(client) {
    return client.post(`/_emdash/api/plugins/${PLUGIN_ID}/admin`, {
      type: 'page_load',
      page: '/status',
    })
  }

  async createPublishedPage(client, { slug, title, content }) {
    const created = expectStatus(
      await client.post('/_emdash/api/content/pages', {
        slug,
        data: { title, content },
      }),
      [200, 201],
      'create page',
    ).data.data
    const id = created.item?.id ?? created.id
    if (!id)
      throw new Error(`create page returned no id: ${JSON.stringify(created)}`)
    const published = expectStatus(
      await client.post(`/_emdash/api/content/pages/${id}/publish`, {}),
      200,
      'publish page',
    ).data.data
    return { id, created, published }
  }
}

/** Reads the status page's banner and fields out of the Block Kit JSON. */
export function describeStatusPage(response) {
  const blocks = response.data?.data?.blocks ?? response.data?.blocks ?? []
  const banner = blocks.find((block) => block.type === 'banner') ?? null
  const fields = Object.fromEntries(
    (blocks.find((block) => block.type === 'fields')?.fields ?? []).map(
      (field) => [field.label, field.value],
    ),
  )
  return {
    status: response.status,
    banner: banner ? { title: banner.title, variant: banner.variant } : null,
    fields,
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}
