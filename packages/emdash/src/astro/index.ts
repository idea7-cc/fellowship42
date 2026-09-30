import ChurchInfo from './ChurchInfo.astro'
import Courses from './Courses.astro'
import Events from './Events.astro'
import Groups from './Groups.astro'
import Sermons from './Sermons.astro'
import ServiceTimes from './ServiceTimes.astro'
import { BLOCK_TYPES } from '../shared/blocks'

/** Renderers EmDash registers for the plugin's Portable Text block types. */
export const blockComponents = {
  [BLOCK_TYPES.churchInfo]: ChurchInfo,
  [BLOCK_TYPES.serviceTimes]: ServiceTimes,
  [BLOCK_TYPES.events]: Events,
  [BLOCK_TYPES.sermons]: Sermons,
  [BLOCK_TYPES.groups]: Groups,
  [BLOCK_TYPES.courses]: Courses,
}
