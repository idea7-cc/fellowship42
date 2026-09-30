import { Hono } from 'hono'
import {
  createSetupClaim,
  isUsableSetupSecret,
} from '@fellowship42/website-contract'
import { requirePermission, type AccessIdentity } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import { websiteOrigin } from '../../lib/website'

type AppEnv = {
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}

/**
 * The installation's website: where it lives and, until its first EmDash
 * administrator exists, a way for a church owner to claim it. EmDash accounts
 * are managed in the website; this grants no Fellowship42 permission.
 */
export const websiteSetupRoutes = new Hono<AppEnv>()

const setupSecret = (env: Env) =>
  (env as Env & { WEBSITE_SETUP_SECRET?: string }).WEBSITE_SETUP_SECRET

websiteSetupRoutes.get('/:churchId', async (c) => {
  await requirePermission(c, c.req.param('churchId'), 'church.write')
  const origin = websiteOrigin(c.env)
  return c.json({
    origin,
    editorUrl: origin ? `${origin}/_emdash/admin` : null,
    setupAvailable: Boolean(origin && isUsableSetupSecret(setupSecret(c.env))),
  })
})

websiteSetupRoutes.post('/:churchId/claim', async (c) => {
  const churchId = c.req.param('churchId')
  // Claiming the website's first administrator is owner authority.
  const user = await requirePermission(c, churchId, '*')
  const origin = websiteOrigin(c.env)
  const secret = setupSecret(c.env)
  if (!origin || !secret || !isUsableSetupSecret(secret))
    throw new AppError(
      409,
      'website_setup_unavailable',
      'Website setup is not configured for this installation.',
    )
  const { token, claim } = await createSetupClaim(secret, {
    audience: origin,
    subject: user.id,
  })
  await c.env.DB.prepare(
    `INSERT INTO audit_events (id, church_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, occurred_at)
     SELECT ?, c.id, ?, 'website.setup_claim_issued', 'website', ?, ?, ?, ?
     FROM churches c JOIN instance_metadata i ON i.primary_church_id = c.id
     WHERE c.id = ?`,
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      origin,
      c.get('requestId'),
      JSON.stringify({ expiresAt: claim.exp * 1000 }),
      Date.now(),
      churchId,
    )
    .run()
  return c.json({
    url: `${origin}/fellowship42/setup#claim=${token}`,
    expiresAt: claim.exp * 1000,
  })
})
