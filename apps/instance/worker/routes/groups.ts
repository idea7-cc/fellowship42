import { Hono } from 'hono'
import type { AppEnv } from '../features/groups/shared'
import { groupPublishingRoutes } from '../features/groups/publishing'
import { groupRosterRoutes } from '../features/groups/roster'
import { groupSessionRoutes } from '../features/groups/sessions'

export const groupRoutes = new Hono<AppEnv>()
groupRoutes.route('/', groupPublishingRoutes)
groupRoutes.route('/', groupRosterRoutes)
groupRoutes.route('/', groupSessionRoutes)
