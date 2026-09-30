// Shared helpers for local acceptance journeys. Everything runs against
// production builds on isolated, synthetic local state and is torn down.
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)
export const instanceDir = path.join(root, 'apps/instance')
export const websiteDir = path.join(root, 'apps/website')
const bin = (dir, name) => path.join(dir, 'node_modules/.bin', name)

export function sh(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
    maxBuffer: 64 * 1024 * 1024,
  })
}

export function buildAll({ skip = false } = {}) {
  if (skip) return
  sh(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    'packages/management-protocol/tsconfig.build.json',
  ])
  sh(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    'packages/website-contract/tsconfig.build.json',
  ])
  sh(bin(instanceDir, 'vite'), ['build'], { cwd: instanceDir })
  sh(bin(websiteDir, 'astro'), ['build'], { cwd: websiteDir })
}

const d1 = (state, ...args) =>
  sh(
    bin(instanceDir, 'wrangler'),
    [
      'd1',
      ...args,
      '--local',
      '--persist-to',
      state,
      '--config',
      'wrangler.jsonc',
    ],
    { cwd: instanceDir },
  )

/** Fresh instance D1 with migrations and the synthetic seed. */
export function prepareInstanceState(state) {
  rmSync(state, { recursive: true, force: true })
  mkdirSync(state, { recursive: true })
  d1(state, 'migrations', 'apply', 'fellowship42')
  d1(state, 'execute', 'fellowship42', '--file', 'seed.sql')
}

export function instanceSql(state, sql) {
  const out = d1(state, 'execute', 'fellowship42', '--command', sql, '--json')
  return JSON.parse(out)[0]?.results ?? []
}

/**
 * The seeded owner receives a ten-minute operator enrollment, as
 * `scripts/recover-owner.mjs` issues it, and must create a passkey.
 */
export function enrollSeedOwner(state) {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  const now = Date.now()
  instanceSql(
    state,
    `UPDATE users SET status='invited', updated_at=${now} WHERE id='user_demo_owner';
     DELETE FROM auth_identities WHERE user_id='user_demo_owner';
     INSERT INTO local_auth_enrollments(id,kind,token_hash,user_id,church_id,expires_at)
       VALUES ('${randomUUID()}','operator','${hash}','user_demo_owner','church_demo',${now + 600_000});`,
  )
  return token
}

const processes = new Set()

export function startServer(name, command, args, { cwd, env, log, logFile }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = []
  const collect = (data) => {
    const text = data.toString()
    lines.push(text)
    if (log) log(`[${name}] ${text}`)
    if (logFile) appendFileSync(logFile, text)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  processes.add(child)
  child.on('exit', () => processes.delete(child))
  return { name, child, output: () => lines.join('') }
}

export function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return
  try {
    process.kill(-server.child.pid, 'SIGTERM')
  } catch {
    // already gone
  }
  processes.delete(server.child)
}

export function stopAll() {
  for (const child of processes) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  processes.clear()
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopAll()
    process.exit(130)
  })
process.on('exit', stopAll)

export async function waitFor(
  url,
  { timeout = 90_000, ok = (r) => r.status < 500 } = {},
) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (ok(response)) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${url} not ready: ${last}`)
}

export function startInstance({ port, state, vars, logFile }) {
  const args = [
    'dev',
    '--config',
    'dist/fellowship42/wrangler.json',
    '--port',
    String(port),
    '--ip',
    '127.0.0.1',
    '--persist-to',
    state,
    '--env-file',
    '/dev/null',
    ...Object.entries(vars).flatMap(([key, value]) => [
      '--var',
      `${key}:${value}`,
    ]),
  ]
  return startServer('instance', bin(instanceDir, 'wrangler'), args, {
    cwd: instanceDir,
    logFile,
  })
}

export function startWebsite({ port, state, vars, logFile, ip = '127.0.0.1' }) {
  const args = [
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--port',
    String(port),
    '--ip',
    ip,
    '--persist-to',
    state,
    '--env-file',
    '/dev/null',
    ...Object.entries(vars).flatMap(([key, value]) => [
      '--var',
      `${key}:${value}`,
    ]),
  ]
  return startServer('website', bin(websiteDir, 'wrangler'), args, {
    cwd: websiteDir,
    logFile,
  })
}

export function secret() {
  return randomBytes(32).toString('base64url')
}

/** EmDash's encryption key format: `emdash_enc_v1_` + 32 base64url bytes. */
export function emdashEncryptionKey() {
  return `emdash_enc_v1_${randomBytes(32).toString('base64url')}`
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** Records named checks; a failed check never stops the journey early. */
export function checklist() {
  const checks = []
  return {
    checks,
    async check(name, run) {
      const started = Date.now()
      try {
        const observed = await run()
        checks.push({ name, pass: true, observed, ms: Date.now() - started })
        console.log(`  ✓ ${name}`)
        return observed
      } catch (error) {
        checks.push({
          name,
          pass: false,
          error: String(error?.message ?? error).slice(0, 2000),
          ms: Date.now() - started,
        })
        console.log(
          `  ✗ ${name}\n      ${String(error?.message ?? error).split('\n')[0]}`,
        )
        return undefined
      }
    },
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/** A Chromium page with a virtual platform authenticator for passkeys. */
export async function passkeyPage(context) {
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return page
}
