import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import { commitOnce, findReplay, idempotencyClaim } from '../../lib/idempotency'
import {
  broadcastContent,
  jsonBody,
  mutationEvidence,
  validationError,
  versionInputSchema,
} from '../../lib/content'
import {
  type AppEnv,
  findGroup,
  touchGroup,
  requireParticipationChange,
} from './shared'
import {
  mapGroupSession,
  mapAttendanceEntry,
  type GroupSessionRow,
  type AttendanceEntryRow,
} from '../../lib/records'
import type { CreateOutcome, GroupSession } from '../../../contracts/api'

export const groupSessionRoutes = new Hono<AppEnv>()

const sessionStatusSchema = z.enum([
  'planned',
  'open',
  'submitted',
  'cancelled',
])
const attendanceStatusSchema = z.enum([
  'present',
  'absent',
  'excused',
  'serving',
])

const sessionFields = {
  title: z.string().trim().min(1).max(200),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive().nullable(),
  location: z.string().trim().min(1).max(240).nullable(),
  topic: z.string().trim().max(2_000).nullable(),
  status: sessionStatusSchema,
}

const sessionCreateInput = z
  .object({
    ...sessionFields,
    endsAt: sessionFields.endsAt.default(null),
    location: sessionFields.location.default(null),
    topic: sessionFields.topic.default(null),
    status: sessionStatusSchema.default('planned'),
  })
  .strict()
  .refine((value) => value.endsAt === null || value.endsAt >= value.startsAt, {
    message: 'A session cannot end before it starts',
    path: ['endsAt'],
  })

const sessionUpdateInput = z
  .object({
    version: z.number().int().positive(),
    title: sessionFields.title.optional(),
    startsAt: sessionFields.startsAt.optional(),
    endsAt: sessionFields.endsAt.optional(),
    location: sessionFields.location.optional(),
    topic: sessionFields.topic.optional(),
    status: sessionFields.status.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one session field must be changed',
  })

const attendanceInput = z
  .object({
    version: z.number().int().nonnegative().default(0),
    status: attendanceStatusSchema,
    notes: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict()

const sessionSelect = `
  SELECT id, group_id, title, status, starts_at, ends_at, location, topic, version
  FROM group_sessions
`

async function findSession(
  db: D1Database,
  churchId: string,
  groupId: string,
  sessionId: string,
) {
  const row = await db
    .prepare(`${sessionSelect} WHERE church_id = ? AND group_id = ? AND id = ?`)
    .bind(churchId, groupId, sessionId)
    .first<GroupSessionRow>()
  if (!row) throw new AppError(404, 'session_not_found', 'Session not found')
  return row
}

async function readSessions(db: D1Database, churchId: string, groupId: string) {
  const rows = await db
    .prepare(
      `${sessionSelect} WHERE church_id = ? AND group_id = ? ORDER BY starts_at DESC`,
    )
    .bind(churchId, groupId)
    .all<GroupSessionRow>()
  return (rows.results ?? []).map(mapGroupSession)
}

/**
 * The register for one session: everyone with a recorded mark, whatever their
 * roster state is now, plus current active or paused members who are not
 * marked yet. Recorded history and its counts never depend on the current
 * roster, and listing unmarked members is what lets the UI show "not
 * recorded" as distinct from "absent". Deleted people are left out, as in
 * every other directory read; their rows stay in D1.
 */
async function readAttendance(
  db: D1Database,
  churchId: string,
  groupId: string,
  session: GroupSessionRow,
) {
  const rows = await db
    .prepare(
      `
        SELECT p.id AS person_id, p.first_name, p.last_name, p.membership_status,
               m.status AS roster_status,
               a.status, a.checked_in_at, a.notes, COALESCE(a.version, 0) AS version
        FROM people p
        LEFT JOIN group_memberships m
          ON m.church_id = p.church_id AND m.group_id = ? AND m.person_id = p.id
        LEFT JOIN attendance_records a
          ON a.church_id = p.church_id AND a.session_id = ? AND a.person_id = p.id
        WHERE p.church_id = ? AND p.deleted_at IS NULL
          AND p.id IN (
            SELECT person_id FROM attendance_records
            WHERE church_id = ? AND session_id = ?
            UNION
            SELECT person_id FROM group_memberships
            WHERE church_id = ? AND group_id = ? AND status IN ('active', 'paused')
          )
        ORDER BY p.sort_name, p.id
      `,
    )
    .bind(
      groupId,
      session.id,
      churchId,
      churchId,
      session.id,
      churchId,
      groupId,
    )
    .all<AttendanceEntryRow>()

  const entries = (rows.results ?? []).map(mapAttendanceEntry)
  return {
    session: mapGroupSession(session),
    entries,
    presentCount: entries.filter((entry) => entry.status === 'present').length,
    recordedCount: entries.filter((entry) => entry.status !== undefined).length,
  }
}

groupSessionRoutes.get('/:churchId/:groupId/sessions', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  await requirePermission(c, churchId, 'groups.write')
  await findGroup(c.env.DB, churchId, groupId)
  return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
})

const createdSession = z.object({ sessionId: z.string() })

async function respondWithSessions(
  c: Context<AppEnv>,
  churchId: string,
  groupId: string,
  replayed: boolean,
) {
  return c.json(
    {
      sessions: await readSessions(c.env.DB, churchId, groupId),
      replayed,
    } satisfies { sessions: GroupSession[] } & CreateOutcome,
    201,
  )
}

groupSessionRoutes.post('/:churchId/:groupId/sessions', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = sessionCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findGroup(c.env.DB, churchId, groupId)
  const claim = await idempotencyClaim(c, {
    operation: 'groups:session:create',
    churchId,
    actorId: actor.id,
    fields: [
      groupId,
      parsed.data.title,
      parsed.data.startsAt,
      parsed.data.endsAt,
      parsed.data.location,
      parsed.data.topic,
      parsed.data.status,
    ],
  })
  if (claim && (await findReplay(c.env.DB, claim, createdSession))) {
    return respondWithSessions(c, churchId, groupId, true)
  }

  const sessionId = `groupsession_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const committed = await commitOnce(c.env.DB, claim, {
    outcome: { sessionId },
    outcomeSchema: createdSession,
    proof: { table: 'group_sessions', churchId, id: sessionId },
    now,
    statements: [
      touchGroup(c.env.DB, churchId, groupId, now, operationId),
      c.env.DB.prepare(
        `
          INSERT INTO group_sessions (
            id, church_id, group_id, title, starts_at, ends_at, location, topic,
            status, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `,
      ).bind(
        sessionId,
        churchId,
        groupId,
        parsed.data.title,
        parsed.data.startsAt,
        parsed.data.endsAt,
        parsed.data.location,
        parsed.data.topic,
        parsed.data.status,
        now,
        now,
        churchId,
        groupId,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.session.created',
        operationId,
        table: 'groups',
        now,
        metadata: { sessionId, status: parsed.data.status },
      }),
    ],
  })
  if (committed.replayed) {
    return respondWithSessions(c, churchId, groupId, true)
  }
  requireParticipationChange(committed.results)
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return respondWithSessions(c, churchId, groupId, false)
})

groupSessionRoutes.patch(
  '/:churchId/:groupId/sessions/:sessionId',
  async (c) => {
    const churchId = c.req.param('churchId')
    const groupId = c.req.param('groupId')
    const sessionId = c.req.param('sessionId')
    const actor = await requirePermission(c, churchId, 'groups.write')
    const parsed = sessionUpdateInput.safeParse(await jsonBody(c))
    if (!parsed.success) throw validationError(parsed.error)
    await findGroup(c.env.DB, churchId, groupId)
    const current = await findSession(c.env.DB, churchId, groupId, sessionId)

    if (current.version !== parsed.data.version) {
      throw new AppError(
        409,
        'version_conflict',
        'The session changed. Refresh before trying again.',
      )
    }
    const next = {
      title: parsed.data.title ?? current.title,
      startsAt: parsed.data.startsAt ?? current.starts_at,
      endsAt:
        parsed.data.endsAt === undefined ? current.ends_at : parsed.data.endsAt,
      location:
        parsed.data.location === undefined
          ? current.location
          : parsed.data.location,
      topic:
        parsed.data.topic === undefined ? current.topic : parsed.data.topic,
      status: parsed.data.status ?? current.status,
    }
    if (next.endsAt !== null && next.endsAt < next.startsAt) {
      throw new AppError(
        422,
        'invalid_session_window',
        'A session cannot end before it starts',
      )
    }

    const operationId = crypto.randomUUID()
    const now = Date.now()
    const results = await c.env.DB.batch([
      touchGroup(
        c.env.DB,
        churchId,
        groupId,
        now,
        operationId,
        `COALESCE((SELECT version FROM group_sessions WHERE church_id = ? AND group_id = ? AND id = ?), 0) = ? AND (1 = 1)`,
        [churchId, groupId, sessionId, parsed.data.version],
      ),
      c.env.DB.prepare(
        `
          UPDATE group_sessions
          SET title = ?, starts_at = ?, ends_at = ?, location = ?, topic = ?,
              status = ?, updated_at = ?, version = version + 1
          WHERE church_id = ? AND group_id = ? AND id = ?
            AND EXISTS (SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?)
        `,
      ).bind(
        next.title,
        next.startsAt,
        next.endsAt,
        next.location,
        next.topic,
        next.status,
        now,
        churchId,
        groupId,
        sessionId,
        churchId,
        groupId,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.session.updated',
        operationId,
        table: 'groups',
        now,
        metadata: { sessionId, status: next.status },
      }),
    ])
    requireParticipationChange(results)
    broadcastContent(c, churchId, 'group', groupId, 'updated')
    return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
  },
)

groupSessionRoutes.delete(
  '/:churchId/:groupId/sessions/:sessionId',
  async (c) => {
    const churchId = c.req.param('churchId')
    const groupId = c.req.param('groupId')
    const sessionId = c.req.param('sessionId')
    const actor = await requirePermission(c, churchId, 'groups.write')
    await findGroup(c.env.DB, churchId, groupId)
    await findSession(c.env.DB, churchId, groupId, sessionId)

    const parsed = versionInputSchema.safeParse(await jsonBody(c))
    if (!parsed.success) throw validationError(parsed.error)
    const operationId = crypto.randomUUID()
    const now = Date.now()
    const results = await c.env.DB.batch([
      touchGroup(
        c.env.DB,
        churchId,
        groupId,
        now,
        operationId,
        `COALESCE((SELECT version FROM group_sessions WHERE church_id = ? AND group_id = ? AND id = ?), 0) = ? AND (1 = 1)`,
        [churchId, groupId, sessionId, parsed.data.version],
      ),
      // attendance_records cascades on session delete.
      c.env.DB.prepare(
        `DELETE FROM group_sessions WHERE church_id = ? AND group_id = ? AND id = ?
          AND EXISTS (SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?)`,
      ).bind(churchId, groupId, sessionId, churchId, groupId, operationId),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.session.removed',
        operationId,
        table: 'groups',
        now,
        metadata: { sessionId },
      }),
    ])
    requireParticipationChange(results)
    broadcastContent(c, churchId, 'group', groupId, 'updated')
    return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
  },
)

groupSessionRoutes.get(
  '/:churchId/:groupId/sessions/:sessionId/attendance',
  async (c) => {
    const churchId = c.req.param('churchId')
    const groupId = c.req.param('groupId')
    await requirePermission(c, churchId, 'attendance.write')
    await findGroup(c.env.DB, churchId, groupId)
    const session = await findSession(
      c.env.DB,
      churchId,
      groupId,
      c.req.param('sessionId'),
    )
    return c.json(await readAttendance(c.env.DB, churchId, groupId, session))
  },
)

groupSessionRoutes.put(
  '/:churchId/:groupId/sessions/:sessionId/attendance/:personId',
  async (c) => {
    const churchId = c.req.param('churchId')
    const groupId = c.req.param('groupId')
    const sessionId = c.req.param('sessionId')
    const personId = c.req.param('personId')
    const actor = await requirePermission(c, churchId, 'attendance.write')
    const parsed = attendanceInput.safeParse(await jsonBody(c))
    if (!parsed.success) throw validationError(parsed.error)
    await findGroup(c.env.DB, churchId, groupId)
    const session = await findSession(c.env.DB, churchId, groupId, sessionId)

    // New marks are for people on the group's roster; attendance for someone
    // who was never in the group is a data-entry mistake, not a record. A
    // recorded mark stays correctable after the person leaves the roster.
    const subject = await c.env.DB.prepare(
      `
          SELECT
            EXISTS (
              SELECT 1 FROM group_memberships
              WHERE church_id = p.church_id AND group_id = ? AND person_id = p.id
            ) AS on_roster,
            EXISTS (
              SELECT 1 FROM attendance_records
              WHERE church_id = p.church_id AND session_id = ? AND person_id = p.id
            ) AS marked
          FROM people p
          WHERE p.church_id = ? AND p.id = ? AND p.deleted_at IS NULL
        `,
    )
      .bind(groupId, sessionId, churchId, personId)
      .first<{ on_roster: number; marked: number }>()
    if (!subject) {
      throw new AppError(404, 'person_not_found', 'Person not found')
    }
    if (!subject.on_roster && !subject.marked) {
      throw new AppError(
        422,
        'not_a_group_member',
        'Only people on this group roster can be marked',
      )
    }

    const recordId = `attendance_${crypto.randomUUID()}`
    const operationId = crypto.randomUUID()
    const now = Date.now()
    const results = await c.env.DB.batch([
      touchGroup(
        c.env.DB,
        churchId,
        groupId,
        now,
        operationId,
        `COALESCE((SELECT version FROM attendance_records WHERE church_id = ? AND session_id = ? AND person_id = ?), 0) = ?
         AND EXISTS (SELECT 1 FROM group_sessions WHERE church_id = ? AND group_id = ? AND id = ?)
         AND EXISTS (SELECT 1 FROM people p WHERE p.church_id = ? AND p.id = ? AND p.deleted_at IS NULL
           AND (EXISTS (SELECT 1 FROM group_memberships m WHERE m.church_id = p.church_id AND m.group_id = ? AND m.person_id = p.id)
             OR EXISTS (SELECT 1 FROM attendance_records r WHERE r.church_id = p.church_id AND r.session_id = ? AND r.person_id = p.id)))`,
        [
          churchId,
          sessionId,
          personId,
          parsed.data.version,
          churchId,
          groupId,
          sessionId,
          churchId,
          personId,
          groupId,
          sessionId,
        ],
      ),
      c.env.DB.prepare(
        `
            INSERT INTO attendance_records (
              id, church_id, session_id, person_id, status, checked_in_at,
              notes, created_at, updated_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
            )
            ON CONFLICT(session_id, person_id) DO UPDATE SET
              version = attendance_records.version + 1,
              status = excluded.status,
              notes = excluded.notes,
              checked_in_at = excluded.checked_in_at,
              updated_at = excluded.updated_at
          `,
      ).bind(
        recordId,
        churchId,
        sessionId,
        personId,
        parsed.data.status,
        parsed.data.status === 'present' ? now : null,
        parsed.data.notes,
        now,
        now,
        churchId,
        groupId,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.attendance.recorded',
        operationId,
        table: 'groups',
        now,
        metadata: { sessionId, personId, status: parsed.data.status },
      }),
    ])
    requireParticipationChange(results)
    broadcastContent(c, churchId, 'group', groupId, 'updated')
    return c.json(await readAttendance(c.env.DB, churchId, groupId, session))
  },
)
