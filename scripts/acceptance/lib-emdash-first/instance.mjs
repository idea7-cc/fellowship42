import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
 * An isolated Fellowship42 instance: the production build of apps/instance,
 * copied out of the working tree, with its own persisted D1/R2/KV state,
 * migrated and seeded with the synthetic demo church.
 */

const OWNER_EMAIL = 'owner@example.test'

/** Anonymous contract read, exactly what any website would request. */
export async function readContract(origin, resource = '', query = '') {
  const response = await fetch(
    `${origin}/api/website/v1${resource ? `/${resource}` : ''}${query}`,
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    },
  )
  return {
    status: response.status,
    headers: {
      cacheControl: response.headers.get('cache-control'),
      accessControlAllowOrigin: response.headers.get(
        'access-control-allow-origin',
      ),
    },
    body: await response.json(),
  }
}
export const CHURCH_ID = 'church_demo'

export class Instance {
  constructor({ repo, workDir, port, logDir, pnpm }) {
    this.repo = repo
    this.port = port
    this.origin = `http://localhost:${port}`
    this.dir = path.join(workDir, 'instance')
    this.state = path.join(this.dir, 'state')
    this.config = path.join(this.dir, 'dist', 'fellowship42', 'wrangler.json')
    this.sourceConfig = path.join(repo, 'apps/instance/wrangler.jsonc')
    this.wrangler = path.join(
      repo,
      'apps/instance/node_modules/wrangler/bin/wrangler.js',
    )
    this.logDir = logDir
    this.pnpm = pnpm
    this.env = childEnv({
      WRANGLER_REGISTRY_PATH: path.join(workDir, 'wrangler-registry'),
      WRANGLER_LOG_PATH: path.join(logDir, 'wrangler-instance-logs'),
    })
    this.server = null
    this.owner = new SoftPasskey('Fellowship42 owner')
    this.staff = new Client(this.origin, {
      label: 'fellowship42-owner',
      headers: { origin: this.origin, accept: 'application/json' },
    })
  }

  log(name) {
    return path.join(this.logDir, name)
  }

  wranglerArgs(...args) {
    return [this.wrangler, ...args]
  }

  /** Builds apps/instance and copies the output so concurrent rebuilds of the working tree cannot change the running Worker. */
  async build({ rebuild = true } = {}) {
    if (rebuild)
      await run(
        this.pnpm.command,
        [...this.pnpm.args, '--filter', '@fellowship42/instance', 'build'],
        { cwd: this.repo, logFile: this.log('instance-build.log') },
      )
    else if (
      !existsSync(
        path.join(this.repo, 'apps/instance/dist/fellowship42/wrangler.json'),
      )
    )
      throw new Error(
        '--no-instance-build needs an existing apps/instance/dist build',
      )
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(path.join(this.dir, 'dist'), { recursive: true })
    for (const part of ['fellowship42', 'client'])
      cpSync(
        path.join(this.repo, 'apps/instance/dist', part),
        path.join(this.dir, 'dist', part),
        { recursive: true },
      )
    // Never carry a developer's local secrets into the acceptance instance.
    for (const leftover of ['.dev.vars', '.env', '.wrangler', '.vite'])
      rmSync(path.join(this.dir, 'dist', 'fellowship42', leftover), {
        recursive: true,
        force: true,
      })
    this.envFile = path.join(this.dir, 'instance.env')
    writeFileSync(
      this.envFile,
      [
        'ENVIRONMENT=production',
        `SIGN_IN_ORIGIN=${this.origin}`,
        `MCP_ORIGIN=${this.origin}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    )
  }

  async d1(args, logName) {
    return run(
      process.execPath,
      this.wranglerArgs(
        'd1',
        'execute',
        'fellowship42',
        '--local',
        '--persist-to',
        this.state,
        '--config',
        this.sourceConfig,
        ...args,
      ),
      { cwd: this.dir, env: this.env, logFile: this.log(logName) },
    )
  }

  /**
   * Fresh local database: schema migrations, the synthetic seed, and an
   * operator owner-recovery enrollment written the way
   * apps/instance/scripts/recover-owner.mjs writes it.
   */
  async prepareState() {
    rmSync(this.state, { recursive: true, force: true })
    await run(
      process.execPath,
      this.wranglerArgs(
        'd1',
        'migrations',
        'apply',
        'fellowship42',
        '--local',
        '--persist-to',
        this.state,
        '--config',
        this.sourceConfig,
      ),
      { cwd: this.dir, env: this.env, logFile: this.log('instance-db.log') },
    )
    await this.d1(
      ['--file', path.join(this.repo, 'apps/instance/seed.sql')],
      'instance-db.log',
    )
    this.enrollmentToken = await this.#ownerRecoveryEnrollment()
  }

  async #ownerRecoveryEnrollment() {
    const id = randomUUID()
    const token = randomBytes(32).toString('base64url')
    const hash = createHash('sha256').update(token).digest('hex')
    const now = Date.now()
    // Same guarded statements as recover-owner.mjs, against this run's
    // --persist-to state instead of the working tree's local database.
    const target = `SELECT DISTINCT u.id,cm.church_id FROM users u JOIN church_memberships cm ON cm.user_id=u.id JOIN instance_metadata im ON im.primary_church_id=cm.church_id JOIN membership_roles mr ON mr.church_id=cm.church_id AND mr.membership_id=cm.id JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE u.email='${OWNER_EMAIL}' COLLATE NOCASE AND cm.status='active' AND rp.permission='*'`
    const statements = [
      `UPDATE agent_connections SET revoked_at=${now} WHERE user_id IN (SELECT id FROM recovery_target) AND revoked_at IS NULL`,
      'DELETE FROM local_auth_sessions WHERE user_id IN (SELECT id FROM recovery_target)',
      'DELETE FROM local_auth_challenges WHERE user_id IN (SELECT id FROM recovery_target)',
      'DELETE FROM local_auth_enrollments WHERE user_id IN (SELECT id FROM recovery_target) OR issuer_user_id IN (SELECT id FROM recovery_target)',
      'DELETE FROM local_auth_passkeys WHERE user_id IN (SELECT id FROM recovery_target)',
      'DELETE FROM auth_identities WHERE user_id IN (SELECT id FROM recovery_target)',
      `UPDATE users SET status='invited',updated_at=${now} WHERE id IN (SELECT id FROM recovery_target)`,
      `INSERT INTO local_auth_enrollments(id,kind,token_hash,user_id,church_id,expires_at) SELECT '${id}','operator','${hash}',id,church_id,${now + 30 * 60 * 1000} FROM recovery_target`,
      `INSERT INTO audit_events(id,church_id,actor_user_id,action,entity_type,entity_id,request_id,occurred_at) SELECT '${randomUUID()}',church_id,NULL,'auth.owner_recovery','user',id,'acceptance-emdash-first',${now} FROM recovery_target`,
    ]
    const file = path.join(this.dir, 'owner-recovery.sql')
    writeFileSync(
      file,
      statements
        .map((statement) => `WITH recovery_target AS (${target}) ${statement};`)
        .join('\n'),
      { mode: 0o600 },
    )
    await this.d1(['--file', file], 'instance-db.log')
    rmSync(file, { force: true })
    const check = JSON.parse(
      await this.d1(
        [
          '--command',
          `SELECT count(*) AS n FROM local_auth_enrollments WHERE id='${id}'`,
          '--json',
        ],
        'instance-db.log',
      ),
    )
    if (!check.some((result) => result.results?.some((row) => row.n === 1)))
      throw new Error('owner recovery enrollment was not created')
    return token
  }

  async start() {
    if (await portInUse(this.port))
      throw new Error(
        `port ${this.port} is already in use; stop whatever is listening there`,
      )
    const inspector = await freePort()
    this.server = new Server(
      'Fellowship42 instance',
      process.execPath,
      this.wranglerArgs(
        'dev',
        '--config',
        this.config,
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
      ),
      {
        cwd: this.dir,
        env: this.env,
        logFile: this.log('instance-server.log'),
      },
    ).start()
    await this.server.waitUntil(async () => {
      const response = await fetch(`${this.origin}/api/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      return response.status === 200
    })
  }

  async stop() {
    await this.server?.stop()
    this.server = null
    await waitForPortFree(this.port)
  }

  async health() {
    const response = await fetch(`${this.origin}/api/health`)
    return response.json()
  }

  contract(resource, query) {
    return readContract(this.origin, resource, query)
  }

  /** Completes the recovery enrollment with a passkey, like the owner would at /sign-in#enroll=… */
  async enrollOwner() {
    const start = expectStatus(
      await this.staff.post('/api/auth/enroll/start', {
        token: this.enrollmentToken,
      }),
      200,
      'instance enrollment start',
    )
    const credential = this.owner.create(start.data, this.origin)
    expectStatus(
      await this.staff.post('/api/auth/enroll/finish', credential),
      200,
      'instance enrollment finish',
    )
    return expectStatus(
      await this.staff.get('/api/session'),
      200,
      'instance owner session',
    ).data
  }

  async createSermon(fields) {
    return expectStatus(
      await this.staff.post(`/api/sermons/${CHURCH_ID}`, fields),
      201,
      'create sermon',
    ).data.sermon
  }

  async updateSermon(sermon, fields) {
    return expectStatus(
      await this.staff.patch(`/api/sermons/${CHURCH_ID}/${sermon.id}`, {
        version: sermon.version,
        ...fields,
      }),
      200,
      'update sermon',
    ).data.sermon
  }

  async deleteSermon(sermon) {
    return expectStatus(
      await this.staff.delete(`/api/sermons/${CHURCH_ID}/${sermon.id}`, {
        version: sermon.version,
      }),
      [200, 204],
      'delete sermon',
    )
  }

  async createEvent(fields) {
    return expectStatus(
      await this.staff.post(`/api/events/${CHURCH_ID}`, fields),
      201,
      'create event',
    ).data.event
  }

  async deleteEvent(event) {
    return expectStatus(
      await this.staff.delete(`/api/events/${CHURCH_ID}/${event.id}`, {
        version: event.version,
      }),
      [200, 204],
      'delete event',
    )
  }
}
