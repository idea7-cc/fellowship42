import { Hono } from 'hono'
import type { AppEnv } from '../features/team/shared'
import { teamMemberRoutes } from '../features/team/members'

export const teamRoutes = new Hono<AppEnv>()
teamRoutes.route('/', teamMemberRoutes)
