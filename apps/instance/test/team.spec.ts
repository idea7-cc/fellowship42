import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  SessionResponse,
  TeamMemberResponse,
  TeamResponse,
} from '../contracts/api'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import { sessionRoutes } from '../worker/routes/session'
import { teamRoutes } from '../worker/routes/team'

const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

// D1 state persists across the cases in this file, so each case invites its
// own email and signs in with its own Access subject.
let caseNumber = 0
let invitee: AccessIdentity
let inviteeEmail: string

const financeOnly: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'team-finance-subject',
  email: 'finance@example.test',
  firstName: 'Finance',
  lastName: 'Only',
}

function teamApp(requestIdentity: AccessIdentity | null) {
  const app = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', requestIdentity)
    c.set('requestId', 'request_team_test')
    await next()
  })
  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500
    return c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message:
            error instanceof HTTPException
              ? error.message
              : 'Internal server error',
        },
      },
      status,
    )
  })
  app.route('/api/session', sessionRoutes)
  app.route('/api/team', teamRoutes)
  return app
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

function requestAs(identity: AccessIdentity | null) {
  const app = teamApp(identity)
  return (method: string, pathname: string, body?: unknown) =>
    app.fetch(
      new Request(`https://fellowship42.test${pathname}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      executionContext,
    )
}

const asOwner = requestAs(owner)
const team = '/api/team/church_demo'

async function membershipEvidence(membershipId: string) {
  const [audit, outbox] = await Promise.all([
    env.DB.prepare(
      `SELECT action, metadata_json FROM audit_events
       WHERE entity_type = 'membership' AND entity_id = ? ORDER BY occurred_at, rowid`,
    )
      .bind(membershipId)
      .all<{ action: string; metadata_json: string | null }>(),
    env.DB.prepare(
      `SELECT topic, payload_json FROM outbox_events
       WHERE aggregate_type = 'membership' AND aggregate_id = ? ORDER BY created_at, rowid`,
    )
      .bind(membershipId)
      .all<{ topic: string; payload_json: string }>(),
  ])
  return { audit: audit.results, outbox: outbox.results }
}

async function evidenceCount() {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM audit_events WHERE entity_type = 'membership')
          + (SELECT COUNT(*) FROM outbox_events WHERE aggregate_type = 'membership') AS total`,
  ).first<{ total: number }>()
  return row?.total ?? 0
}

async function invite(
  email: string,
  roleKeys: string[],
  names: { firstName?: string; lastName?: string } = {},
) {
  const response = await asOwner('POST', `${team}/invitations`, {
    email,
    roleKeys,
    ...names,
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as TeamMemberResponse).member
}

beforeEach(async () => {
  const now = Date.now()
  caseNumber += 1
  inviteeEmail = `treasurer-${caseNumber}@example.test`
  invitee = {
    provider: 'cloudflare-access',
    subject: `team-invitee-subject-${caseNumber}`,
    email: inviteeEmail,
    firstName: 'Tess',
    lastName: 'Treasurer',
  }
  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES ('identity_demo_owner', 'user_demo_owner', ?, ?, ?, ?, ?)
    `,
  )
    .bind(owner.provider, owner.subject, owner.email, now, now)
    .run()
})

describe('team membership management', () => {
  it('lists the bootstrapped owner and the church roles', async () => {
    const response = await asOwner('GET', team)
    expect(response.status).toBe(200)
    const body = (await response.json()) as TeamResponse
    expect(body.members).toHaveLength(1)
    expect(body.members[0]).toMatchObject({
      membershipId: 'membership_demo_owner',
      email: 'owner@example.test',
      accountStatus: 'active',
      membershipStatus: 'active',
      roleKeys: ['owner'],
      version: 1,
    })
    expect(body.roles.map((role) => role.key)).toEqual([
      'finance',
      'member',
      'ministry-leader',
      'owner',
    ])
    expect(
      body.roles.find((role) => role.key === 'owner')?.permissions,
    ).toEqual(['*'])
  })

  it('denies anonymous and unprivileged callers without writing evidence', async () => {
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (id, email, first_name, last_name, status, created_at, updated_at)
           VALUES ('user_team_finance', 'finance@example.test', 'Finance', 'Only', 'active', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO auth_identities (id, user_id, provider, subject, email_at_provider, created_at, updated_at)
           VALUES ('authid_team_finance', 'user_team_finance', 'cloudflare-access', 'team-finance-subject', 'finance@example.test', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO church_memberships (id, church_id, user_id, status, joined_at, created_at, updated_at)
           VALUES ('membership_team_finance', 'church_demo', 'user_team_finance', 'active', ?, ?, ?)`,
      ).bind(now, now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO membership_roles (church_id, membership_id, role_id, assigned_at, assigned_by_user_id)
           VALUES ('church_demo', 'membership_team_finance', 'role_demo_finance', ?, 'user_demo_owner')`,
      ).bind(now),
    ])

    const evidenceBefore = await evidenceCount()
    const anonymous = requestAs(null)
    expect((await anonymous('GET', team)).status).toBe(401)

    const asFinance = requestAs(financeOnly)
    expect((await asFinance('GET', team)).status).toBe(403)
    const denied = await asFinance('POST', `${team}/invitations`, {
      email: 'intruder@example.test',
      roleKeys: ['owner'],
    })
    expect(denied.status).toBe(403)
    expect(
      (
        await asFinance('DELETE', `${team}/membership_demo_owner`, {
          version: 1,
        })
      ).status,
    ).toBe(403)

    const intruder = await env.DB.prepare(
      `SELECT 1 AS present FROM users WHERE email = 'intruder@example.test'`,
    ).first()
    expect(intruder).toBeNull()
    expect(await evidenceCount()).toBe(evidenceBefore)
  })

  it('invites a new person with roles and records privacy-bounded evidence', async () => {
    const member = await invite(
      inviteeEmail.toUpperCase(),
      ['finance', 'member'],
      { firstName: 'Tess', lastName: 'Treasurer' },
    )
    expect(member).toMatchObject({
      email: inviteeEmail,
      firstName: 'Tess',
      lastName: 'Treasurer',
      accountStatus: 'invited',
      membershipStatus: 'active',
      roleKeys: ['finance', 'member'],
      version: 1,
    })
    expect(member.lastSeenAt).toBeUndefined()

    const listed = (await (await asOwner('GET', team)).json()) as TeamResponse
    expect(listed.members.map((entry) => entry.email)).toContain(inviteeEmail)

    const evidence = await membershipEvidence(member.membershipId)
    expect(evidence.audit.map((row) => row.action)).toEqual([
      'team.member.invited',
    ])
    const metadata = evidence.audit[0].metadata_json ?? ''
    expect(JSON.parse(metadata)).toEqual({ roleKeys: ['finance', 'member'] })
    expect(metadata).not.toContain('treasurer-')
    expect(metadata).not.toContain('Tess')
    expect(evidence.outbox).toEqual([
      {
        topic: 'team.member.invited',
        payload_json: JSON.stringify({ membershipId: member.membershipId }),
      },
    ])
  })

  it('activates the invited account on first sign-in with the granted permissions', async () => {
    const member = await invite(inviteeEmail, ['finance'])

    const asInvitee = requestAs(invitee)
    const session = await asInvitee('GET', '/api/session')
    expect(session.status).toBe(200)
    const body = (await session.json()) as SessionResponse
    expect(body.user?.memberships).toEqual([
      {
        churchId: 'church_demo',
        churchName: 'Fellowship Demo Church',
        permissions: ['contributions.read', 'contributions.write'],
        roles: ['finance'],
      },
    ])
    // The invitation does not confer team administration.
    expect((await asInvitee('GET', team)).status).toBe(403)

    const listed = (await (await asOwner('GET', team)).json()) as TeamResponse
    const activated = listed.members.find(
      (entry) => entry.membershipId === member.membershipId,
    )
    expect(activated?.accountStatus).toBe('active')
    expect(activated?.lastSeenAt).toBeTypeOf('number')
  })

  it('links an invitation to a person who signed in before being invited', async () => {
    // Anyone the Access policy admits gets a user row on first sign-in, even
    // without a membership. Inviting that email must reuse the account.
    const asInvitee = requestAs(invitee)
    const before = (await (
      await asInvitee('GET', '/api/session')
    ).json()) as SessionResponse
    expect(before.user?.memberships).toEqual([])

    const member = await invite(inviteeEmail, ['ministry-leader'])
    expect(member.userId).toBe(before.user?.id)
    expect(member.accountStatus).toBe('active')

    const after = (await (
      await asInvitee('GET', '/api/session')
    ).json()) as SessionResponse
    expect(after.user?.memberships[0]?.roles).toEqual(['ministry-leader'])
  })

  it('rejects duplicate invitations, unknown roles, and malformed input', async () => {
    const member = await invite(inviteeEmail, ['finance'])
    const duplicate = await asOwner('POST', `${team}/invitations`, {
      email: inviteeEmail.toUpperCase(),
      roleKeys: ['owner'],
    })
    expect(duplicate.status).toBe(409)
    expect(
      ((await duplicate.json()) as { error: { code: string } }).error.code,
    ).toBe('team_member_exists')

    const unknownRole = await asOwner('POST', `${team}/invitations`, {
      email: 'someone@example.test',
      roleKeys: ['finance', 'superuser'],
    })
    expect(unknownRole.status).toBe(422)
    expect(
      ((await unknownRole.json()) as { error: { code: string } }).error.code,
    ).toBe('invalid_role')

    expect(
      (
        await asOwner('POST', `${team}/invitations`, {
          email: 'not-an-email',
          roleKeys: ['finance'],
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await asOwner('POST', `${team}/invitations`, {
          email: 'someone@example.test',
          roleKeys: [],
        })
      ).status,
    ).toBe(422)

    const evidence = await membershipEvidence(member.membershipId)
    expect(evidence.audit.map((row) => row.action)).toEqual([
      'team.member.invited',
    ])
    const stray = await env.DB.prepare(
      `SELECT 1 AS present FROM users WHERE email = 'someone@example.test'`,
    ).first()
    expect(stray).toBeNull()
  })

  it('changes roles only with the observed version', async () => {
    const member = await invite(inviteeEmail, ['finance'])
    const path = `${team}/${member.membershipId}`

    const stale = await asOwner('PATCH', path, {
      version: 7,
      roleKeys: ['ministry-leader'],
    })
    expect(stale.status).toBe(409)
    expect(
      ((await stale.json()) as { error: { code: string } }).error.code,
    ).toBe('version_conflict')

    const updated = await asOwner('PATCH', path, {
      version: 1,
      roleKeys: ['ministry-leader', 'member'],
    })
    expect(updated.status).toBe(200)
    expect(((await updated.json()) as TeamMemberResponse).member).toMatchObject(
      {
        roleKeys: ['member', 'ministry-leader'],
        version: 2,
      },
    )

    const evidence = await membershipEvidence(member.membershipId)
    expect(evidence.audit.map((row) => row.action)).toEqual([
      'team.member.invited',
      'team.member.updated',
    ])
    expect(JSON.parse(evidence.audit[1].metadata_json ?? '')).toEqual({
      previousVersion: 1,
      status: 'active',
      roleKeys: ['ministry-leader', 'member'],
    })
  })

  it('suspends, reinstates, removes, and re-invites a member on one record', async () => {
    const member = await invite(inviteeEmail, ['finance'])
    const path = `${team}/${member.membershipId}`
    const asInvitee = requestAs(invitee)

    const suspended = await asOwner('PATCH', path, {
      version: 1,
      status: 'suspended',
    })
    expect(suspended.status).toBe(200)
    expect(
      ((await suspended.json()) as TeamMemberResponse).member,
    ).toMatchObject({
      membershipStatus: 'suspended',
      roleKeys: ['finance'],
      version: 2,
    })
    const whileSuspended = (await (
      await asInvitee('GET', '/api/session')
    ).json()) as SessionResponse
    expect(whileSuspended.user?.memberships).toEqual([])

    const reinstated = await asOwner('PATCH', path, {
      version: 2,
      status: 'active',
    })
    expect(reinstated.status).toBe(200)
    const back = (await (
      await asInvitee('GET', '/api/session')
    ).json()) as SessionResponse
    expect(back.user?.memberships[0]?.roles).toEqual(['finance'])

    expect((await asOwner('DELETE', path, { version: 3 })).status).toBe(204)
    expect((await asOwner('DELETE', path, { version: 4 })).status).toBe(404)
    const gone = (await (await asOwner('GET', team)).json()) as TeamResponse
    expect(gone.members.map((entry) => entry.membershipId)).not.toContain(
      member.membershipId,
    )
    const roles = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM membership_roles WHERE membership_id = ?`,
    )
      .bind(member.membershipId)
      .first<{ total: number }>()
    expect(roles?.total).toBe(0)

    const again = await invite(inviteeEmail, ['member'])
    expect(again.membershipId).toBe(member.membershipId)
    expect(again).toMatchObject({ roleKeys: ['member'], version: 5 })
    expect(
      (await membershipEvidence(member.membershipId)).audit.map(
        (row) => row.action,
      ),
    ).toEqual([
      'team.member.invited',
      'team.member.updated',
      'team.member.updated',
      'team.member.removed',
      'team.member.invited',
    ])
  })

  it('never leaves the church without an active owner', async () => {
    const ownerPath = `${team}/membership_demo_owner`
    const demote = await asOwner('PATCH', ownerPath, {
      version: 1,
      roleKeys: ['finance'],
    })
    expect(demote.status).toBe(409)
    expect(
      ((await demote.json()) as { error: { code: string } }).error.code,
    ).toBe('last_owner_required')
    expect(
      (await asOwner('PATCH', ownerPath, { version: 1, status: 'suspended' }))
        .status,
    ).toBe(409)
    expect((await asOwner('DELETE', ownerPath, { version: 1 })).status).toBe(
      409,
    )
    expect(await membershipEvidence('membership_demo_owner')).toEqual({
      audit: [],
      outbox: [],
    })

    // A second owner unlocks every change to the first. This case runs last
    // because the bootstrapped owner loses their membership here.
    const second = await invite(inviteeEmail, ['owner'])
    const removed = await asOwner('DELETE', ownerPath, { version: 1 })
    expect(removed.status).toBe(204)

    const listed = (await (
      await requestAs(invitee)('GET', team)
    ).json()) as TeamResponse
    expect(listed.members.map((entry) => entry.membershipId)).toContain(
      second.membershipId,
    )
    expect(listed.members.map((entry) => entry.membershipId)).not.toContain(
      'membership_demo_owner',
    )
    // The removed owner no longer holds a membership.
    expect((await asOwner('GET', team)).status).toBe(403)
    expect(
      (await membershipEvidence('membership_demo_owner')).audit.map(
        (row) => row.action,
      ),
    ).toEqual(['team.member.removed'])
  })
})
