/**
 * The same church components for use directly in theme layouts, outside
 * Portable Text. Pass display choices as `node`, e.g.
 * `<UpcomingEvents node={{ _key: 'this-week', heading: 'This week', limit: 3, paginate: true }} />`.
 *
 * `_key` (letters, digits, `-`, `_`; at most 40) names the component's paging
 * parameter, `?f42-<_key>=`. Give each paginated component on a page its own
 * `_key`: without one, components of the same type share a paging
 * parameter. Heading ids are unique on the page either way. Pages that show
 * these components must render on demand and stay out of every cache; see
 * the package README.
 */
export { default as ChurchInfo } from './ChurchInfo.astro'
export { default as ServiceTimes } from './ServiceTimes.astro'
export { default as UpcomingEvents } from './Events.astro'
export { default as RecentSermons } from './Sermons.astro'
export { default as Groups } from './Groups.astro'
export { default as Courses } from './Courses.astro'
