import { Hono } from 'hono'
import { z } from 'zod'
import {
  portableInstanceIdSchema,
  type InstanceRuntimeHealth,
} from '@fellowship42/management-protocol'
import {
  syncCurrentUser,
  type AccessIdentity,
  type CurrentUser,
} from '../lib/auth'
import { AppError } from '../lib/errors'
import type {
  BootstrapResponse,
  BootstrapStatusResponse,
} from '../../src/lib/api-types'

type BootstrapBindings = Env & {
  BOOTSTRAP_OWNER_EMAIL?: string
  F42_PORTABLE_INSTANCE_ID?: string
}

type AppEnv = {
  Bindings: BootstrapBindings
  Variables: {
    identity: AccessIdentity | null
    requestId: string
  }
}

const bootstrapInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().trim().min(1).max(64),
  locale: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
})

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>

interface InstanceRow {
  instance_id: string
  church_id: string
  church_name: string
  church_slug: string
}

const systemRoles = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full church administration',
    permissions: ['*'],
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Giving and finance access',
    permissions: ['contributions.read', 'contributions.write'],
  },
  {
    key: 'ministry-leader',
    name: 'Ministry leader',
    description: 'Ministry and group management',
    permissions: [
      'people.read',
      'groups.write',
      'courses.write',
      'events.write',
      'sermons.write',
      'media.write',
      'attendance.write',
    ],
  },
  {
    key: 'member',
    name: 'Member',
    description: 'Member portal access',
    permissions: ['profile.read'],
  },
] as const

async function findInstance(db: D1Database): Promise<InstanceRow | null> {
  return db
    .prepare(
      `
      SELECT
        im.instance_id,
        c.id AS church_id,
        c.name AS church_name,
        c.slug AS church_slug
      FROM instance_metadata im
      JOIN churches c ON c.id = im.primary_church_id
      WHERE im.singleton = 1 AND c.deleted_at IS NULL
    `,
    )
    .first<InstanceRow>()
}

function configuredResponse(instance: InstanceRow): BootstrapStatusResponse {
  return {
    state: 'configured',
    instance: {
      churchId: instance.church_id,
      churchName: instance.church_name,
      churchSlug: instance.church_slug,
    },
  }
}

export async function inspectBootstrapReadiness(
  db: D1Database,
  configuredInstanceId: string | undefined,
  configuredOwnerEmail: string | undefined,
): Promise<InstanceRuntimeHealth['bootstrap']> {
  const configuredIdentity = portableInstanceIdSchema.safeParse(
    configuredInstanceId?.trim(),
  )
  if (!configuredIdentity.success) {
    return {
      state: 'configuration-invalid',
      portableIdentitySha256: null,
    }
  }
  const storedIdentity = await db
    .prepare('SELECT instance_id FROM instance_metadata WHERE singleton = 1')
    .first<{ instance_id: string }>()
  const effectiveIdentity =
    storedIdentity?.instance_id ?? configuredIdentity.data
  const portableIdentitySha256 = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(effectiveIdentity),
      ),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    state:
      storedIdentity?.instance_id !== undefined &&
      storedIdentity.instance_id !== configuredIdentity.data
        ? 'identity-mismatch'
        : storedIdentity
          ? 'configured'
          : configuredOwnerEmail?.trim()
            ? 'awaiting-owner'
            : 'awaiting-owner-configuration',
    portableIdentitySha256,
  }
}

export function isBootstrapOwner(
  identity: AccessIdentity,
  configuredEmail: string | undefined,
) {
  return Boolean(
    configuredEmail?.trim() &&
      identity.email.toLowerCase() === configuredEmail.trim().toLowerCase(),
  )
}

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new AppError(400, 'invalid_timezone', 'Choose a valid IANA timezone')
  }
}

export async function bootstrapInstance(
  db: D1Database,
  identity: AccessIdentity,
  configuredOwnerEmail: string | undefined,
  configuredInstanceId: string | undefined,
  inputValue: unknown,
  requestId: string,
): Promise<BootstrapResponse> {
  if (!configuredOwnerEmail?.trim()) {
    throw new AppError(
      503,
      'bootstrap_owner_not_configured',
      'The deployment has not configured its first owner',
    )
  }
  if (!isBootstrapOwner(identity, configuredOwnerEmail)) {
    throw new AppError(
      403,
      'bootstrap_owner_mismatch',
      'This identity cannot initialize the instance',
    )
  }

  const instanceIdResult = portableInstanceIdSchema.safeParse(
    configuredInstanceId?.trim(),
  )
  if (!instanceIdResult.success) {
    throw new AppError(
      503,
      'bootstrap_instance_id_not_configured',
      'The deployment has not configured its portable instance identity',
    )
  }

  const existing = await findInstance(db)
  if (existing)
    throw new AppError(
      409,
      'instance_already_configured',
      'The instance is already configured',
    )

  const parsed = bootstrapInputSchema.safeParse(inputValue)
  if (!parsed.success) {
    throw new AppError(
      400,
      'invalid_bootstrap_input',
      'Check the church setup details and try again',
    )
  }
  validateTimezone(parsed.data.timezone)

  const owner: CurrentUser = await syncCurrentUser(db, identity)
  const now = Date.now()
  const churchId = `church_${crypto.randomUUID()}`
  const instanceId = instanceIdResult.data
  const membershipId = `membership_${crypto.randomUUID()}`
  const roleIds = new Map(
    systemRoles.map((role) => [role.key, `role_${crypto.randomUUID()}`]),
  )
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `
        INSERT INTO churches (
          id, slug, name, status, plan, timezone, locale, created_at, updated_at
        ) VALUES (?, ?, ?, 'draft', 'community', ?, ?, ?, ?)
      `,
      )
      .bind(
        churchId,
        parsed.data.slug,
        parsed.data.name,
        parsed.data.timezone,
        parsed.data.locale,
        now,
        now,
      ),
    db
      .prepare(
        `
        INSERT INTO church_profiles (church_id, country_code, updated_at)
        VALUES (?, ?, ?)
      `,
      )
      .bind(churchId, parsed.data.countryCode, now),
    db
      .prepare(
        `
        INSERT INTO instance_metadata (
          singleton, instance_id, topology, primary_church_id, created_at, updated_at
        ) VALUES (1, ?, 'single-church', ?, ?, ?)
      `,
      )
      .bind(instanceId, churchId, now, now),
    db
      .prepare(
        `
        INSERT INTO church_memberships (
          id, church_id, user_id, status, joined_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?)
      `,
      )
      .bind(membershipId, churchId, owner.id, now, now, now),
  ]

  for (const role of systemRoles) {
    const roleId = roleIds.get(role.key)!
    statements.push(
      db
        .prepare(
          `
          INSERT INTO roles (
            id, church_id, key, name, description, is_system, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
        )
        .bind(
          roleId,
          churchId,
          role.key,
          role.name,
          role.description,
          now,
          now,
        ),
      ...role.permissions.map((permission) =>
        db
          .prepare(
            'INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)',
          )
          .bind(roleId, permission),
      ),
    )
  }

  statements.push(
    db
      .prepare(
        `
        INSERT INTO membership_roles (
          church_id, membership_id, role_id, assigned_at, assigned_by_user_id
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .bind(churchId, membershipId, roleIds.get('owner'), now, owner.id),
    db
      .prepare(
        `
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, after_json, metadata_json, occurred_at
        ) VALUES (?, ?, ?, 'instance.bootstrapped', 'instance', ?, ?, ?, ?, ?)
      `,
      )
      .bind(
        crypto.randomUUID(),
        churchId,
        owner.id,
        instanceId,
        requestId,
        JSON.stringify({ instanceId, churchId, churchSlug: parsed.data.slug }),
        JSON.stringify({ identityProvider: identity.provider }),
        now,
      ),
  )

  try {
    await db.batch(statements)
  } catch (error) {
    if (await findInstance(db)) {
      throw new AppError(
        409,
        'instance_already_configured',
        'The instance is already configured',
      )
    }
    throw error
  }

  return {
    state: 'configured',
    instance: {
      id: instanceId,
      churchId,
      churchName: parsed.data.name,
      churchSlug: parsed.data.slug,
    },
  }
}

export const bootstrapRoutes = new Hono<AppEnv>()

bootstrapRoutes.get('/', async (c) => {
  const existing = await findInstance(c.env.DB)
  if (existing)
    return c.json<BootstrapStatusResponse>(configuredResponse(existing))

  const identity = c.get('identity')
  return c.json<BootstrapStatusResponse>({
    state: 'unconfigured',
    authenticated: Boolean(identity),
    eligible: Boolean(
      identity && isBootstrapOwner(identity, c.env.BOOTSTRAP_OWNER_EMAIL),
    ),
    ownerConfigured: Boolean(c.env.BOOTSTRAP_OWNER_EMAIL?.trim()),
  })
})

bootstrapRoutes.post('/', async (c) => {
  const identity = c.get('identity')
  if (!identity)
    throw new AppError(
      401,
      'authentication_required',
      'Authentication is required',
    )

  let input: unknown
  try {
    input = await c.req.json()
  } catch {
    throw new AppError(
      400,
      'invalid_json',
      'The request body must be valid JSON',
    )
  }

  return c.json(
    await bootstrapInstance(
      c.env.DB,
      identity,
      c.env.BOOTSTRAP_OWNER_EMAIL,
      c.env.F42_PORTABLE_INSTANCE_ID,
      input,
      c.get('requestId'),
    ),
    201,
  )
})
