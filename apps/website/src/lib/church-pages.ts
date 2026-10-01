import { BLOCK_TYPES } from '@fellowship42/emdash/shared'

/**
 * Pages that always exist, even before an editor creates them: each renders
 * church blocks. An EmDash page with the same slug replaces the built-in one.
 */
export interface ChurchPage {
  title: string
  description: string
  blocks: Array<Record<string, unknown> & { _type: string; _key: string }>
}

export const churchPages: Record<string, ChurchPage> = {
  about: {
    title: 'About',
    description: 'Who we are, where to find us, and how to get in touch.',
    blocks: [
      {
        _type: BLOCK_TYPES.churchInfo,
        _key: 'church',
        heading: '',
        showAbout: true,
        showContact: true,
      },
    ],
  },
  visit: {
    title: 'Plan a visit',
    description: 'Service times, directions, and how to get in touch.',
    blocks: [
      {
        _type: BLOCK_TYPES.serviceTimes,
        _key: 'services',
        heading: 'Service times',
      },
      {
        _type: BLOCK_TYPES.churchInfo,
        _key: 'church',
        heading: 'Find us',
        showAbout: false,
        showContact: true,
      },
    ],
  },
  events: {
    title: 'Events',
    description: 'Upcoming events at church.',
    blocks: [
      {
        _type: BLOCK_TYPES.events,
        _key: 'events',
        heading: '',
        limit: 12,
        paginate: true,
      },
    ],
  },
  sermons: {
    title: 'Sermons',
    description: 'Recent sermons, newest first.',
    blocks: [
      {
        _type: BLOCK_TYPES.sermons,
        _key: 'sermons',
        heading: '',
        limit: 12,
        paginate: true,
      },
    ],
  },
  groups: {
    title: 'Groups',
    description: 'Groups you can join.',
    blocks: [
      {
        _type: BLOCK_TYPES.groups,
        _key: 'groups',
        heading: '',
        limit: 24,
        paginate: true,
      },
    ],
  },
  courses: {
    title: 'Courses',
    description: 'Courses and classes.',
    blocks: [
      {
        _type: BLOCK_TYPES.courses,
        _key: 'courses',
        heading: '',
        limit: 24,
        paginate: true,
      },
    ],
  },
}

/** The built-in page for `slug`, if there is one. */
export function builtInPage(slug: string): ChurchPage | undefined {
  return Object.hasOwn(churchPages, slug) ? churchPages[slug] : undefined
}

/** Home page content when an editor has not created a "home" page. */
export const homeBlocks: ChurchPage['blocks'] = [
  { _type: BLOCK_TYPES.serviceTimes, _key: 'services', heading: 'Join us' },
  {
    _type: BLOCK_TYPES.events,
    _key: 'events',
    heading: 'Upcoming events',
    limit: 3,
  },
  {
    _type: BLOCK_TYPES.sermons,
    _key: 'sermons',
    heading: 'Recent sermons',
    limit: 3,
  },
  { _type: BLOCK_TYPES.churchInfo, _key: 'church', heading: 'About us' },
]
