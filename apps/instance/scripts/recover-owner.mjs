import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Infrastructure-authorized recovery. No raw token or provider output goes to logs.
const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
let directory
let output
let reserved = false
try {
  const allowed = new Set([
    '--config',
    '--database',
    '--origin',
    '--email',
    '--output',
    '--confirm-reset-owner',
    '--local',
    '--remote',
  ])
  const flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (!allowed.has(flag) || flags.has(flag)) throw new Error()
    const boolean = ['--local', '--remote', '--confirm-reset-owner'].includes(
      flag,
    )
    if (!boolean && (!args[i + 1] || args[i + 1].startsWith('--')))
      throw new Error()
    flags.set(flag, boolean ? true : args[++i])
  }
  for (const flag of [
    '--config',
    '--database',
    '--origin',
    '--email',
    '--output',
    '--confirm-reset-owner',
  ])
    if (!flags.has(flag)) throw new Error()
  if (flags.has('--local') === flags.has('--remote')) throw new Error()
  const origin = new URL(value('--origin'))
  if (
    origin.origin !== value('--origin') ||
    (origin.protocol !== 'https:' &&
      !(
        flags.has('--local') &&
        origin.protocol === 'http:' &&
        origin.hostname === 'localhost'
      ))
  )
    throw new Error()
  const email = value('--email').trim().toLowerCase()
  if (!/^[^\s'@]+@[^\s'@]+\.[^\s'@]+$/.test(email)) throw new Error()
  output = resolve(value('--output'))
  closeSync(openSync(output, 'wx', 0o600))
  reserved = true
  directory = mkdtempSync(join(tmpdir(), 'f42-owner-recovery-'))
  const id = randomUUID(),
    token = randomBytes(32).toString('base64url'),
    hash = createHash('sha256').update(token).digest('hex'),
    now = Date.now()
  const quote = (v) => `'${v.replaceAll("'", "''")}'`
  // The repeated CTE is an exact owner target guard. Every operation is
  // fail-closed if it is empty. Revocation precedes replacement enrollment.
  const target = `SELECT DISTINCT u.id,cm.church_id FROM users u JOIN church_memberships cm ON cm.user_id=u.id JOIN instance_metadata im ON im.primary_church_id=cm.church_id JOIN membership_roles mr ON mr.church_id=cm.church_id AND mr.membership_id=cm.id JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE u.email=${quote(email)} COLLATE NOCASE AND cm.status='active' AND rp.permission='*'`
  const sql = `UPDATE agent_connections SET revoked_at=${now} WHERE user_id IN (SELECT id FROM recovery_target) AND revoked_at IS NULL;
DELETE FROM local_auth_sessions WHERE user_id IN (SELECT id FROM recovery_target);
DELETE FROM local_auth_challenges WHERE user_id IN (SELECT id FROM recovery_target);
DELETE FROM local_auth_enrollments WHERE user_id IN (SELECT id FROM recovery_target) OR issuer_user_id IN (SELECT id FROM recovery_target);
DELETE FROM local_auth_passkeys WHERE user_id IN (SELECT id FROM recovery_target);
DELETE FROM auth_identities WHERE user_id IN (SELECT id FROM recovery_target);
UPDATE users SET status='invited',updated_at=${now} WHERE id IN (SELECT id FROM recovery_target);
INSERT INTO local_auth_enrollments(id,kind,token_hash,user_id,church_id,expires_at) SELECT '${id}','operator','${hash}',id,church_id,${now + 10 * 60 * 1000} FROM recovery_target;
INSERT INTO audit_events(id,church_id,actor_user_id,action,entity_type,entity_id,request_id,occurred_at) SELECT '${randomUUID()}',church_id,NULL,'auth.owner_recovery','user',id,'operator-recovery',${now} FROM recovery_target;
SELECT count(*) AS recovery_count FROM local_auth_enrollments WHERE id='${id}';
`
  const guardedSql = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `WITH recovery_target AS (${target}) ${statement};`)
    .join('\n')
  const file = join(directory, 'recovery.sql')
  writeFileSync(file, guardedSql, { mode: 0o600 })
  const result = JSON.parse(
    execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        value('--database'),
        '--config',
        resolve(value('--config')),
        flags.has('--remote') ? '--remote' : '--local',
        '--file',
        file,
        '--json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  )
  if (
    !Array.isArray(result) ||
    !result.some((r) => r.results?.some((row) => row.recovery_count === 1))
  )
    throw new Error()
  writeFileSync(output, `${origin.origin}/sign-in#enroll=${token}\n`, {
    mode: 0o600,
  })
  console.log(
    'Owner sign-in reset. A private enrollment link was written to the requested file; it expires in ten minutes.',
  )
} catch {
  if (reserved && output) rmSync(output, { force: true })
  console.error(
    'Recovery did not complete. Check the exact config, database, owner email, origin, and output path. Inspect the instance before retrying; credentials may already be revoked. Required flags: --config --database --origin --email --output --confirm-reset-owner and exactly one of --local or --remote.',
  )
  process.exitCode = 1
} finally {
  if (directory) rmSync(directory, { recursive: true, force: true })
}
