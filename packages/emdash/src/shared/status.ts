import {
  normalizeInstanceOrigin,
  type ContractFetch,
  type SourceResult,
  type WebsiteDescriptor,
} from '@fellowship42/website-contract'
import {
  CONNECTION_ENV,
  CONNECTION_ISSUE_MESSAGES,
  sourceFor,
  type ConnectionConfig,
  type ConnectionIssue,
} from './connection'

/**
 * Block Kit page explaining the connection and, just as importantly, where
 * each kind of content is edited and what each publish action makes public.
 * Returned as plain JSON so both the trusted plugin and the sandboxed
 * connector can serve it.
 */

type Block = Record<string, unknown>

/** EmDash's Administrator role, the only role that edits plugin settings. */
export const ADMINISTRATOR_ROLE = 50

export interface StatusOptions {
  /** The registry connector: no blocks, no deployment variables. */
  sandboxed?: boolean
  /** The viewer's EmDash role; only Administrators get the settings link. */
  viewerRole?: number | null
}

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

const ISSUE_BANNERS: Record<ConnectionIssue, string> = {
  'settings-unreadable':
    'The Fellowship42 connection settings could not be read',
  'private-host': 'The Fellowship42 address is a local or private address',
  'invalid-identity-pin':
    'The church identity pin is not a valid 64-character digest',
}

function identityPinText(config: ConnectionConfig, verified: boolean) {
  if (!config.identityPinnedBy) return 'Not set'
  const by =
    config.identityPinnedBy === 'deployment'
      ? 'Set by the website deployment'
      : 'Set in plugin settings'
  if (config.issue === 'invalid-identity-pin')
    return `${by} (not a valid digest)`
  return verified ? `${by} (verified)` : by
}

function copyHint(config: ConnectionConfig, sandboxed: boolean) {
  if (config.identityPinnedBy === 'deployment')
    return config.issue === 'invalid-identity-pin'
      ? `Set ${CONNECTION_ENV.instance} in the website deployment to this full digest.`
      : `The website deployment pins the church identity (${CONNECTION_ENV.instance}).`
  const where = sandboxed
    ? 'Church identity in the connection settings'
    : `Church identity in the connection settings, or ${CONNECTION_ENV.instance} in the website deployment`
  return `To refuse any other church, copy this full digest into ${where}.`
}

export function connectionStatusBlocks(
  config: ConnectionConfig,
  result: SourceResult<WebsiteDescriptor>,
  options: StatusOptions = {},
): { blocks: Block[] } {
  const sandboxed = options.sandboxed === true
  const origin = normalizeInstanceOrigin(config.url)
  const state = result.ok
    ? result.data.site.status === 'published'
      ? 'connected'
      : 'unpublished'
    : result.state
  const banner = config.issue
    ? {
        title: ISSUE_BANNERS[config.issue],
        description: CONNECTION_ISSUE_MESSAGES[config.issue],
        variant: 'error',
      }
    : {
        ...(BANNERS[state] ?? BANNERS.unavailable!),
        description: result.ok
          ? state === 'connected'
            ? 'Church blocks on your pages show the currently published Fellowship42 records.'
            : 'Church blocks show a notice until the church publishes its website in Fellowship42.'
          : result.message,
      }
  const fields: { label: string; value: string }[] = [
    { label: 'Fellowship42 address', value: origin ?? config.url ?? 'Not set' },
    {
      label: 'Connection set by',
      value: config.pinned
        ? 'Website deployment (cannot be changed here)'
        : 'Plugin settings (Administrators only)',
    },
    {
      label: 'Identity pin',
      value: identityPinText(
        config,
        result.ok && config.expectedInstanceSha256 !== null && !config.issue,
      ),
    },
  ]
  if (result.ok) {
    if (result.data.church)
      fields.unshift({ label: 'Church', value: result.data.church.name })
    fields.push({
      label: 'Website contract',
      value: `Version ${result.data.version}`,
    })
  }
  const blocks: Block[] = [
    { type: 'header', text: 'Fellowship42' },
    { type: 'banner', ...banner },
    { type: 'fields', fields },
  ]
  if (result.ok)
    blocks.push(
      {
        type: 'section',
        text: `Church identity digest of ${result.data.church?.name ?? 'the church at this address'}:`,
      },
      {
        type: 'code',
        code: result.data.instance.portableIdentitySha256,
        language: 'bash',
      },
      { type: 'context', text: copyHint(config, sandboxed) },
    )
  blocks.push(
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
      text: sandboxed
        ? 'This registry connector provides the connection and church structured data. Church blocks for pages require the trusted @fellowship42/emdash package, which a site developer installs in the site code.'
        : 'Insert church blocks from the "Church (Fellowship42)" section of the editor menu. Blocks store only display choices, never copies of church records.',
    },
  )
  const actions: Block[] = []
  if (origin)
    actions.push({
      type: 'link',
      label: 'Open Fellowship42',
      target: { kind: 'external', url: `${origin}/app` },
      appearance: 'primary',
    })
  if (!config.pinned && (options.viewerRole ?? 0) >= ADMINISTRATOR_ROLE)
    actions.push({
      type: 'link',
      label: 'Connection settings',
      target: { kind: 'plugin-settings' },
    })
  if (actions.length) blocks.push({ type: 'actions', elements: actions })
  return { blocks }
}

/**
 * Loads and renders the status page. A malformed identity pin still refuses
 * every visitor read, but the page reads the address without it so the
 * Administrator can copy the correct digest.
 */
export async function connectionStatus(
  config: ConnectionConfig,
  fetch: ContractFetch,
  options: StatusOptions = {},
) {
  const probe =
    config.issue === 'invalid-identity-pin'
      ? { ...config, expectedInstanceSha256: null, issue: null }
      : config
  return connectionStatusBlocks(
    config,
    await sourceFor(probe, fetch).describe(),
    options,
  )
}
