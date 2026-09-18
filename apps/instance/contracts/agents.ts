import { z } from 'zod'

export const agentScopeSchema = z.enum([
  'church:read',
  'draft:read',
  'draft:write',
  'events:read',
  'events:write',
])
export const agentScopes = agentScopeSchema.options
export type AgentScope = z.infer<typeof agentScopeSchema>
export const scopeLabels: Record<AgentScope, string> = {
  'church:read': 'Read church information',
  'draft:read': 'Read your website draft',
  'draft:write': 'Save changes to your draft',
  'events:read': 'Read events, including drafts',
  'events:write': 'Create unpublished event drafts',
}
export interface AgentConnection {
  id: string
  clientName: string
  clientId: string
  scopes: AgentScope[]
  createdAt: number
  expiresAt: number
  revokedAt: number | null
}
export interface AgentConnections {
  endpoint: string | null
  connections: AgentConnection[]
}
export interface AgentConsent {
  requestId: string
  churchName: string
  clientName: string
  clientId: string
  redirectOrigin: string
  scopes: AgentScope[]
}
