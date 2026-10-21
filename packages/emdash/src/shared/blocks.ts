/**
 * Portable Text block types for church content. A block stores only display
 * choices (heading, how many items, paging); the records themselves are read
 * from Fellowship42 each time the page renders, so editors never hold a copy.
 */

export const BLOCK_TYPES = {
  churchInfo: 'f42ChurchInfo',
  serviceTimes: 'f42ServiceTimes',
  events: 'f42Events',
  sermons: 'f42Sermons',
  groups: 'f42Groups',
  courses: 'f42Courses',
} as const

export type BlockType = (typeof BLOCK_TYPES)[keyof typeof BLOCK_TYPES]

const CATEGORY = 'Church (Fellowship42)'
const SOURCE_NOTE =
  'Edited and published in Fellowship42; this block always shows the current published version.'

function heading(initial: string) {
  return {
    type: 'text_input' as const,
    action_id: 'heading',
    label: 'Heading',
    initial_value: initial,
  }
}

function limit(initial: number) {
  return {
    type: 'number_input' as const,
    action_id: 'limit',
    label: 'Items per page',
    min: 1,
    max: 50,
    initial_value: initial,
  }
}

const paginate = {
  type: 'toggle' as const,
  action_id: 'paginate',
  label: 'Show links to more items',
  initial_value: false,
}

export const portableTextBlocks = [
  {
    type: BLOCK_TYPES.churchInfo,
    label: 'Church information',
    description: `About the church, address, and contact details. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [
      heading('About us'),
      {
        type: 'toggle' as const,
        action_id: 'showAbout',
        label: 'Show the church description',
        initial_value: true,
      },
      {
        type: 'toggle' as const,
        action_id: 'showContact',
        label: 'Show address and contact details',
        initial_value: true,
      },
    ],
  },
  {
    type: BLOCK_TYPES.serviceTimes,
    label: 'Service times',
    description: `Weekly gatherings in the church's time zone. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [heading('Service times')],
  },
  {
    type: BLOCK_TYPES.events,
    label: 'Upcoming events',
    icon: 'form',
    description: `Published events that have not ended. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [heading('Upcoming events'), limit(5), paginate],
  },
  {
    type: BLOCK_TYPES.sermons,
    label: 'Recent sermons',
    icon: 'form',
    description: `Published sermons, newest first. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [heading('Recent sermons'), limit(5), paginate],
  },
  {
    type: BLOCK_TYPES.groups,
    label: 'Groups',
    icon: 'form',
    description: `Published groups and how to join. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [heading('Groups'), limit(12), paginate],
  },
  {
    type: BLOCK_TYPES.courses,
    label: 'Courses',
    icon: 'form',
    description: `Published courses, linking to their pages in Fellowship42. ${SOURCE_NOTE}`,
    category: CATEGORY,
    fields: [heading('Courses'), limit(12), paginate],
  },
]

/** Values an editor may store on a block; anything else is ignored. */
export interface BlockSettings {
  _key?: string
  heading?: unknown
  limit?: unknown
  paginate?: unknown
  showAbout?: unknown
  showContact?: unknown
}

export function blockHeading(node: BlockSettings, fallback: string) {
  return typeof node.heading === 'string' ? node.heading.trim() : fallback
}

export function blockLimit(node: BlockSettings, fallback: number) {
  const value =
    typeof node.limit === 'number' ? node.limit : Number(node.limit ?? NaN)
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : fallback
}

export function blockFlag(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
