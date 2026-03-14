'use client'

import type { UIFieldClientProps } from 'payload'
import { useDocumentInfo } from '@payloadcms/ui'

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

export function LandingPageDocumentLinks(_: UIFieldClientProps) {
  const { data, id } = useDocumentInfo()
  const pageID = id ?? data?.id

  if (!pageID) {
    return (
      <div style={panelStyle}>
        <strong>Page links</strong>
        <p style={{ margin: 0 }}>Save this landing page first to generate preview and public links.</p>
      </div>
    )
  }

  const query = new URLSearchParams({
    pageID: String(pageID),
  })

  return (
    <div style={panelStyle}>
      <strong>Page links</strong>
      <p style={{ margin: 0 }}>
        Preview this draft directly, or open the public route to compare the live page against the unpublished version.
      </p>
      <div style={actionsStyle}>
        <a href={`/preview/landing-page?${query.toString()}`} style={linkStyle}>
          Preview draft
        </a>
        <a href={`/admin-tools/landing-pages?mode=public&${query.toString()}`} style={linkStyle}>
          Open public route
        </a>
      </div>
    </div>
  )
}
