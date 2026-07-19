import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { bootstrapInstance, isBootstrapOwner } from '../worker/routes/bootstrap'
import type { AccessIdentity } from '../worker/lib/auth'
import { churchRoutes } from '../worker/routes/churches'

const ownerIdentity: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'first-owner-subject',
  email: 'owner@example.test',
  firstName: 'First',
  lastName: 'Owner',
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM audit_events'),
    env.DB.prepare('DELETE FROM instance_metadata'),
    env.DB.prepare('DELETE FROM churches'),
    env.DB.prepare('DELETE FROM auth_identities'),
    env.DB.prepare('DELETE FROM users'),
  ])
})

describe('production instance bootstrap', () => {
  it('matches the configured owner email without case sensitivity or disclosure', () => {
    expect(isBootstrapOwner(ownerIdentity, ' OWNER@example.test ')).toBe(true)
    expect(isBootstrapOwner(ownerIdentity, 'someone-else@example.test')).toBe(false)
    expect(isBootstrapOwner(ownerIdentity, undefined)).toBe(false)
  })

  it('atomically creates the portable instance, church, first owner, roles, and audit event', async () => {
    const result = await bootstrapInstance(
      env.DB,
      ownerIdentity,
      'owner@example.test',
      {
        name: 'Grace Community Church',
        slug: 'grace-community',
        timezone: 'America/New_York',
        locale: 'en-US',
        countryCode: 'us',
      },
      'request_bootstrap_test',
    )

    expect(result.state).toBe('configured')
    expect(result.instance.id).toMatch(/^instance_[0-9a-f-]{36}$/)
    expect(result.instance.churchId).toMatch(/^church_[0-9a-f-]{36}$/)

    const installation = await env.DB
      .prepare(`
        SELECT im.instance_id, im.topology, c.name, c.slug, c.status, c.plan,
               c.timezone, c.locale, cp.country_code
        FROM instance_metadata im
        JOIN churches c ON c.id = im.primary_church_id
        JOIN church_profiles cp ON cp.church_id = c.id
        WHERE im.singleton = 1
      `)
      .first<{
        instance_id: string
        topology: string
        name: string
        slug: string
        status: string
        plan: string
        timezone: string
        locale: string
        country_code: string
      }>()
    expect(installation).toEqual({
      instance_id: result.instance.id,
      topology: 'single-church',
      name: 'Grace Community Church',
      slug: 'grace-community',
      status: 'draft',
      plan: 'community',
      timezone: 'America/New_York',
      locale: 'en-US',
      country_code: 'US',
    })

    const owner = await env.DB
      .prepare(`
        SELECT u.email, ai.provider, ai.subject, r.key, rp.permission
        FROM users u
        JOIN auth_identities ai ON ai.user_id = u.id
        JOIN church_memberships cm ON cm.user_id = u.id
        JOIN membership_roles mr ON mr.membership_id = cm.id AND mr.church_id = cm.church_id
        JOIN roles r ON r.id = mr.role_id AND r.church_id = cm.church_id
        JOIN role_permissions rp ON rp.role_id = r.id
        WHERE cm.church_id = ?
      `)
      .bind(result.instance.churchId)
      .first<{
        email: string
        provider: string
        subject: string
        key: string
        permission: string
      }>()
    expect(owner).toEqual({
      email: 'owner@example.test',
      provider: 'cloudflare-access',
      subject: 'first-owner-subject',
      key: 'owner',
      permission: '*',
    })

    const roleCount = await env.DB
      .prepare('SELECT COUNT(*) AS total FROM roles WHERE church_id = ? AND is_system = 1')
      .bind(result.instance.churchId)
      .first<{ total: number }>()
    expect(roleCount?.total).toBe(4)

    const audit = await env.DB
      .prepare(`
        SELECT action, entity_type, entity_id, request_id, metadata_json
        FROM audit_events
        WHERE church_id = ?
      `)
      .bind(result.instance.churchId)
      .first<{
        action: string
        entity_type: string
        entity_id: string
        request_id: string
        metadata_json: string
      }>()
    expect(audit).toMatchObject({
      action: 'instance.bootstrapped',
      entity_type: 'instance',
      entity_id: result.instance.id,
      request_id: 'request_bootstrap_test',
    })
    expect(JSON.parse(audit!.metadata_json)).toEqual({ identityProvider: 'cloudflare-access' })

    const ownerApp = new Hono<{
      Bindings: Env
      Variables: { identity: AccessIdentity | null; requestId: string }
    }>()
    ownerApp.use('*', async (c, next) => {
      c.set('identity', ownerIdentity)
      c.set('requestId', 'request_owner_visibility')
      await next()
    })
    ownerApp.route('/churches', churchRoutes)
    const draftResponse = await ownerApp.request(
      `/churches/${encodeURIComponent(result.instance.churchId)}`,
      {},
      env,
    )
    expect(draftResponse.status).toBe(200)
    await expect(draftResponse.json()).resolves.toMatchObject({
      church: { id: result.instance.churchId, name: 'Grace Community Church', status: 'draft' },
    })

    await expect(
      bootstrapInstance(
        env.DB,
        { ...ownerIdentity, subject: 'second-owner', email: 'second@example.test' },
        'second@example.test',
        {
          name: 'Other Church',
          slug: 'other-church',
          timezone: 'UTC',
          locale: 'en-US',
          countryCode: 'US',
        },
        'request_second_bootstrap',
      ),
    ).rejects.toMatchObject({ status: 409, code: 'instance_already_configured' })
  })

  it('rejects missing owner configuration, mismatched identities, and invalid timezones', async () => {
    const input = {
      name: 'Grace Community Church',
      slug: 'grace-community',
      timezone: 'Not/A_Timezone',
      locale: 'en-US',
      countryCode: 'US',
    }

    await expect(
      bootstrapInstance(env.DB, ownerIdentity, undefined, input, 'request_missing_owner'),
    ).rejects.toMatchObject({ status: 503, code: 'bootstrap_owner_not_configured' })
    await expect(
      bootstrapInstance(
        env.DB,
        ownerIdentity,
        'someone@example.test',
        input,
        'request_wrong_owner',
      ),
    ).rejects.toMatchObject({ status: 403, code: 'bootstrap_owner_mismatch' })
    await expect(
      bootstrapInstance(
        env.DB,
        ownerIdentity,
        'owner@example.test',
        input,
        'request_bad_timezone',
      ),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_timezone' })

    const instanceCount = await env.DB
      .prepare('SELECT COUNT(*) AS total FROM instance_metadata')
      .first<{ total: number }>()
    expect(instanceCount?.total).toBe(0)
  })
})
