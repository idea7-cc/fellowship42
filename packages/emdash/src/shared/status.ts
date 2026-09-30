import type {
  SourceResult,
  WebsiteDescriptor,
} from '@fellowship42/website-contract'
import type { ConnectionConfig } from './connection'
import { describeConnection } from './connection'

/**
 * Block Kit page explaining the connection and, just as importantly, where
 * each kind of content is edited and what each publish action makes public.
 * Returned as plain JSON so both the trusted plugin and the sandboxed
 * connector can serve it.
 */

type Block = Record<string, unknown>

const BANNERS: Record<string, { title: string; variant: string }> = {
  connected: { title: 'Connected to Fellowship42', variant: 'default' },
  unpublished: {
    title: 'Connected, but the church website is not published in Fellowship42',
    variant: 'alert',
  },
  'not-configured': {
    title: 'Not connected to Fellowship42',
    variant: 'alert',
  },
  unavailable: { title: 'Fellowship42 is not responding', variant: 'error' },
  incompatible: {
    title: 'This address is not a compatible Fellowship42 instance',
    variant: 'error',
  },
  'wrong-instance': {
    title: 'Connected to a different church than expected',
    variant: 'error',
  },
  'invalid-request': { title: 'Unexpected response', variant: 'error' },
}

export function connectionStatusBlocks(
  config: ConnectionConfig,
  result: SourceResult<WebsiteDescriptor>,
  options: { sandboxed?: boolean } = {},
): { blocks: Block[] } {
  const connection = describeConnection(config)
  const state = result.ok
    ? result.data.site.status === 'published'
      ? 'connected'
      : 'unpublished'
    : result.state
  const banner = BANNERS[state] ?? BANNERS.unavailable!
  const fields: { label: string; value: string }[] = [
    { label: 'Fellowship42 address', value: connection.origin ?? 'Not set' },
    {
      label: 'Connection set by',
      value: connection.pinned
        ? 'Website deployment (cannot be changed here)'
        : 'Plugin settings (Administrators only)',
    },
  ]
  if (result.ok) {
    if (result.data.church)
      fields.unshift({ label: 'Church', value: result.data.church.name })
    fields.push(
      {
        label: 'Church identity',
        value: `${result.data.instance.portableIdentitySha256.slice(0, 16)}…${connection.identityPinned ? ' (verified)' : ' (not pinned)'}`,
      },
      { label: 'Website contract', value: `Version ${result.data.version}` },
    )
  }
  const blocks: Block[] = [
    { type: 'header', text: 'Fellowship42' },
    {
      type: 'banner',
      title: banner.title,
      description: result.ok
        ? state === 'connected'
          ? 'Church blocks on your pages show the currently published Fellowship42 records.'
          : 'Church blocks show a notice until the church publishes its website in Fellowship42.'
        : result.message,
      variant: banner.variant,
    },
    { type: 'fields', fields },
    { type: 'divider' },
    { type: 'header', text: 'Where content is edited' },
    {
      type: 'section',
      text: 'Pages, articles, menus, and design are edited here. Publishing a page or article makes that page public; drafts and previews stay private.',
    },
    {
      type: 'section',
      text: 'The church profile and service times are edited in Fellowship42 Settings. Publishing there updates every page that shows them on the next visit.',
    },
    {
      type: 'section',
      text: 'Events, sermons, groups, and courses are edited in Fellowship42. Each item appears here only while it is published there, and disappears on the next visit after it is withdrawn or deleted.',
    },
    {
      type: 'context',
      text: options.sandboxed
        ? 'This registry connector provides the connection and church structured data. Church blocks for pages require the trusted @fellowship42/emdash package, which a site developer installs in the site code.'
        : 'Insert church blocks from the "Church (Fellowship42)" section of the editor menu. Blocks store only display choices, never copies of church records.',
    },
  ]
  const actions: Block[] = []
  if (connection.origin)
    actions.push({
      type: 'link',
      label: 'Open Fellowship42',
      target: { kind: 'external', url: `${connection.origin}/app` },
      appearance: 'primary',
    })
  if (!connection.pinned)
    actions.push({
      type: 'link',
      label: 'Connection settings',
      target: { kind: 'plugin-settings' },
    })
  if (actions.length) blocks.push({ type: 'actions', elements: actions })
  return { blocks }
}
