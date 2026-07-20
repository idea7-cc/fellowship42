import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { syncCurrentUser, type AccessIdentity } from '../worker/lib/auth'

async function get(path: string) {
  return exports.default.fetch(new Request(`https://fellowship42.test${path}`))
}

describe('Fellowship42 edge API', () => {
  it('reports D1 readiness', async () => {
    const response = await get('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'fellowship42-instance',
      topology: 'single-church',
      storage: 'd1',
      outbox: 'clear',
      paymentWebhooks: 'ready',
      bootstrap: {
        state: 'configured',
        portableIdentitySha256:
          'b1d2ba57c210a83b249479d7a83a0c61c74e310f4e2c7f2f52d6930cc8cf726b',
      },
    })
  })

  it('seeds one portable instance identity for the primary church', async () => {
    const instance = await env.DB.prepare(
      `
        SELECT instance_id, topology, primary_church_id
        FROM instance_metadata
        WHERE singleton = 1
      `,
    ).first<{
      instance_id: string
      topology: string
      primary_church_id: string
    }>()

    expect(instance).toEqual({
      instance_id: 'instance_42424242-1234-5678-9abc-123456789abc',
      topology: 'single-church',
      primary_church_id: 'church_demo',
    })
  })

  it('reports configured bootstrap state without exposing owner configuration', async () => {
    const response = await get('/api/bootstrap')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      state: 'configured',
      instance: {
        churchId: 'church_demo',
        churchName: 'Fellowship Demo Church',
        churchSlug: 'fellowship-demo',
      },
    })
  })

  it('returns seeded public church and course data', async () => {
    const churchResponse = await get('/api/churches/fellowship-demo')
    const churchBody = await churchResponse.json<{
      church: { id: string; serviceTimes: unknown[] }
    }>()

    expect(churchResponse.status).toBe(200)
    expect(churchBody.church.id).toBe('church_demo')
    expect(churchBody.church.serviceTimes).toHaveLength(2)

    const courseResponse = await get(
      '/api/churches/fellowship-demo/courses/welcome-to-fellowship',
    )
    const courseBody = await courseResponse.json<{
      course: { lessonCount: number }
      lessons: unknown[]
    }>()

    expect(courseResponse.status).toBe(200)
    expect(courseBody.course.lessonCount).toBe(2)
    expect(courseBody.lessons).toHaveLength(2)
  })

  it('keeps the people directory private without an Access JWT', async () => {
    const response = await get('/api/people/church_demo')
    const body = await response.json<{
      error: { code: string; requestId: string }
    }>()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('authentication_required')
    expect(body.error.requestId).toBeTruthy()
  })

  it('returns a structured error for unknown API routes', async () => {
    const response = await get('/api/not-a-route')
    const body = await response.json<{ error: { code: string } }>()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('route_not_found')
  })

  it('converges concurrent Access sessions and rejects suspended users', async () => {
    const identity: AccessIdentity = {
      provider: 'cloudflare-access',
      subject: 'access-test-user',
      email: 'access-user@example.test',
      firstName: 'Access',
      lastName: 'User',
    }

    const [first, second] = await Promise.all([
      syncCurrentUser(env.DB, identity),
      syncCurrentUser(env.DB, identity),
    ])
    expect(first.id).toBe(second.id)

    const identityCount = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM auth_identities WHERE provider = ? AND subject = ?',
    )
      .bind(identity.provider, identity.subject)
      .first<{ total: number }>()
    expect(identityCount?.total).toBe(1)

    await expect(
      syncCurrentUser(env.DB, {
        ...identity,
        subject: 'different-access-subject',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'identity_link_required' })

    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?")
      .bind(first.id)
      .run()
    await expect(syncCurrentUser(env.DB, identity)).rejects.toMatchObject({
      status: 403,
      code: 'account_suspended',
    })
  })

  it('allows an invited email to activate once without relinking an active account', async () => {
    const now = Date.now()
    await env.DB.prepare(
      `
        INSERT INTO users (
          id, email, first_name, last_name, status, created_at, updated_at
        ) VALUES ('user_invited', 'invited@example.test', '', '', 'invited', ?, ?)
      `,
    )
      .bind(now, now)
      .run()

    const activated = await syncCurrentUser(env.DB, {
      provider: 'cloudflare-access',
      subject: 'invited-access-subject',
      email: 'invited@example.test',
      firstName: 'Invited',
      lastName: 'Owner',
    })
    expect(activated.id).toBe('user_invited')

    const user = await env.DB.prepare(
      'SELECT status, first_name, last_name FROM users WHERE id = ?',
    )
      .bind('user_invited')
      .first<{ status: string; first_name: string; last_name: string }>()
    expect(user).toEqual({
      status: 'active',
      first_name: 'Invited',
      last_name: 'Owner',
    })

    await expect(
      syncCurrentUser(env.DB, {
        provider: 'cloudflare-access',
        subject: 'another-invited-subject',
        email: 'invited@example.test',
        firstName: 'Invited',
        lastName: 'Owner',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'identity_link_required' })
  })
})
