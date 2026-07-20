import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requirePermission, type AccessIdentity } from '../lib/auth'
import { AppError } from '../lib/errors'
import {
  approveEnrollment,
  createEnrollmentChallenge,
  disconnectManagement,
  installation,
  managementExitDisposition,
  managementStatus,
  rotateManagementIdentity,
  submitEnrollmentProposal,
  type ManagementBindings,
} from '../management/service'
import {
  approveUpdatePreparation,
  listUpdatePreparations,
} from '../management/updates'

type AppEnv = {
  Bindings: ManagementBindings
  Variables: {
    identity: AccessIdentity | null
    requestId: string
  }
}

const approvalSchema = z
  .object({
    challengeId: z.uuid(),
    grants: z.unknown(),
  })
  .strict()

const disconnectSchema = z
  .object({ reason: z.string().trim().min(1).max(240) })
  .strict()

const updateApprovalSchema = z
  .object({
    releaseTag: z.string().regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    releaseManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

async function jsonBody(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    throw new AppError(400, 'invalid_json', 'The request body must be valid JSON')
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new AppError(422, 'validation_failed', z.prettifyError(parsed.error))
  }
  return parsed.data
}

async function requireManagementOwner(c: Context<AppEnv>) {
  const installed = await installation(c.env.DB)
  return requirePermission(c, installed.churchId, 'management.admin')
}

export const managementRoutes = new Hono<AppEnv>()

managementRoutes.get('/', async (c) => {
  await requireManagementOwner(c)
  return c.json(await managementStatus(c.env.DB))
})

managementRoutes.get('/exit-disposition', async (c) => {
  await requireManagementOwner(c)
  return c.json(await managementExitDisposition(c.env.DB))
})

managementRoutes.get('/updates', async (c) => {
  await requireManagementOwner(c)
  return c.json({ preparations: await listUpdatePreparations(c.env) })
})

managementRoutes.post('/updates/:preparationId/approve', async (c) => {
  const owner = await requireManagementOwner(c)
  const installed = await installation(c.env.DB)
  const input = parse(updateApprovalSchema, await jsonBody(c))
  return c.json(
    await approveUpdatePreparation(
      c.env,
      c.req.param('preparationId'),
      input,
      owner.id,
      installed.churchId,
      c.get('requestId'),
    ),
  )
})

managementRoutes.post('/challenges', async (c) => {
  const owner = await requireManagementOwner(c)
  const challenge = await createEnrollmentChallenge(
    c.env.DB,
    c.env,
    owner.id,
    c.get('requestId'),
  )
  return c.json(challenge, 201)
})

// This is the sole unauthenticated management route. The one-time challenge
// code is a 256-bit bearer credential, stored only as a SHA-256 digest, and is
// consumed atomically after the operator's Ed25519 signature is verified.
managementRoutes.post('/proposals', async (c) => {
  const proposal = await submitEnrollmentProposal(
    c.env.DB,
    await jsonBody(c),
    c.get('requestId'),
  )
  return c.json(proposal, 202)
})

managementRoutes.post('/approve', async (c) => {
  const owner = await requireManagementOwner(c)
  const input = parse(approvalSchema, await jsonBody(c))
  const approved = await approveEnrollment(
    c.env.DB,
    c.env,
    input.challengeId,
    input.grants,
    owner.id,
    c.get('requestId'),
  )
  return c.json(approved, 201)
})

managementRoutes.post('/rotate', async (c) => {
  const owner = await requireManagementOwner(c)
  const notice = await rotateManagementIdentity(
    c.env.DB,
    c.env,
    owner.id,
    c.get('requestId'),
  )
  return c.json({ notice })
})

managementRoutes.post('/disconnect', async (c) => {
  const owner = await requireManagementOwner(c)
  const input = parse(disconnectSchema, await jsonBody(c))
  return c.json(
    await disconnectManagement(
      c.env.DB,
      owner.id,
      c.get('requestId'),
      input.reason,
    ),
  )
})
