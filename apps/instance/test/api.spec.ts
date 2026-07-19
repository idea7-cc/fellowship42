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
    })
  })

  it('seeds one portable instance identity for the primary church', async () => {
    const instance = await env.DB
      .prepare(`
        SELECT instance_id, topology, primary_church_id
        FROM instance_metadata
        WHERE singleton = 1
      `)
      .first<{
        instance_id: string
        topology: string
        primary_church_id: string
      }>()

    expect(instance).toEqual({
      instance_id: 'instance_demo',
      topology: 'single-church',
      primary_church_id: 'church_demo',
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
    const body = await response.json<{ error: { code: string; requestId: string } }>()

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

    const identityCount = await env.DB
      .prepare('SELECT COUNT(*) AS total FROM auth_identities WHERE provider = ? AND subject = ?')
      .bind(identity.provider, identity.subject)
      .first<{ total: number }>()
    expect(identityCount?.total).toBe(1)

    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(first.id).run()
    await expect(syncCurrentUser(env.DB, identity)).rejects.toMatchObject({
      status: 403,
      code: 'account_suspended',
    })
  })
})
