'use client'

import type { UIFieldClientProps } from 'payload'
import { useDocumentInfo } from '@payloadcms/ui'

import {
  landingPageOwnerConfig,
  type LandingPageOwnerCollection,
} from '@/lib/landing-page-urls'

type OwnerFieldCustom = {
  ownerCollection?: LandingPageOwnerCollection
}

const panelStyle = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: '12px',
  display: 'grid',
  gap: '0.75rem',
  padding: '1rem',
} as const

const actionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
} as const

const linkStyle = {
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: '999px',
  color: 'var(--theme-text)',
  fontSize: '0.9rem',
  fontWeight: 600,
  padding: '0.55rem 0.85rem',
  textDecoration: 'none',
} as const

export function LandingPageOwnerActions({ field }: UIFieldClientProps) {
  const { data, id } = useDocumentInfo()
  const custom = (field.admin?.custom ?? {}) as OwnerFieldCustom
  const ownerCollection = custom.ownerCollection
  const ownerID = id ?? data?.id

  if (!ownerCollection) {
    return null
  }

  if (!ownerID) {
    return (
      <div style={panelStyle}>
        <strong>Landing page</strong>
        <p style={{ margin: 0 }}>Save this record first so Fellowship42 can attach a landing page to it.</p>
      </div>
    )
  }

  const query = new URLSearchParams({
    ownerCollection,
    ownerID: String(ownerID),
  })
  const ownerLabel = landingPageOwnerConfig[ownerCollection].label

  return (
    <div style={panelStyle}>
      <strong>Landing page</strong>
      <p style={{ margin: 0 }}>
        Create or update a dedicated public page for this {ownerLabel}, or preview the structured default page that
        already inherits the church theme.
      </p>
      <div style={actionsStyle}>
        <a href={`/admin-tools/landing-pages?${query.toString()}`} style={linkStyle}>
          Create or edit
        </a>
        <a href={`/preview/landing-page?${query.toString()}`} style={linkStyle}>
          Preview page
        </a>
        <a href={`/admin-tools/landing-pages?mode=public&${query.toString()}`} style={linkStyle}>
          Open public route
        </a>
      </div>
    </div>
  )
}
