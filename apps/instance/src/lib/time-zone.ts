/**
 * Date and time helpers that never depend on the browser's timezone.
 *
 * Staff may edit from anywhere, so an event's `datetime-local` value is read
 * and shown in the event's own IANA zone, and a sermon's date is a calendar
 * date stored at noon UTC of that day.
 */

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let formatter = partsFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, formatter)
  }
  return formatter
}

/** Wall-clock fields of an instant in `timeZone`, read back as if UTC. */
function wallClockAsUtc(epochMs: number, timeZone: string) {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value]),
  )
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
}

/** Offset of `timeZone` from UTC at an instant, in milliseconds. */
function zoneOffset(epochMs: number, timeZone: string) {
  const whole = Math.floor(epochMs / 1000) * 1000
  return wallClockAsUtc(whole, timeZone) - whole
}

export function isValidTimeZone(timeZone: string) {
  if (!timeZone.trim()) return false
  try {
    partsFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** `YYYY-MM-DDTHH:mm` for a `datetime-local` input, in `timeZone`. */
export function toZonedInputValue(epochMs: number, timeZone: string) {
  return new Date(wallClockAsUtc(epochMs, timeZone)).toISOString().slice(0, 16)
}

/**
 * The instant a `datetime-local` value names in `timeZone`. A time skipped by
 * a daylight-saving change moves forward; a repeated time resolves to its
 * first occurrence. Returns `NaN` for a malformed value and throws a
 * `RangeError` for an unknown zone.
 */
export function fromZonedInputValue(value: string, timeZone: string) {
  const match = INPUT_PATTERN.exec(value)
  partsFormatter(timeZone)
  if (!match) return Number.NaN
  const [, year, month, day, hour, minute] = match.map(Number)
  const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  const before = zoneOffset(wall - DAY_MS, timeZone)
  const after = zoneOffset(wall + DAY_MS, timeZone)
  const matches = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((instant) => wallClockAsUtc(instant, timeZone) === wall)
  if (matches.length) return Math.min(...matches)
  // In a gap: keep the offset in force before the change, as clocks do.
  return wall - before
}

const listFormatters = new Map<string, Intl.DateTimeFormat>()

/** Medium date and short time of an instant as seen in `timeZone`. */
export function formatInTimeZone(epochMs: number, timeZone: string) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  let formatter = listFormatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: zone,
    })
    listFormatters.set(zone, formatter)
  }
  return formatter.format(new Date(epochMs))
}

/** A `YYYY-MM-DD` calendar date stored as noon UTC of that day. */
export function calendarDateToEpoch(value: string) {
  const match = DATE_PATTERN.exec(value)
  if (!match) return Number.NaN
  const [, year, month, day] = match.map(Number)
  return Date.UTC(year!, month! - 1, day!, 12)
}

/** The `YYYY-MM-DD` calendar date a stored date names. */
export function epochToCalendarDate(epochMs: number) {
  return new Date(epochMs).toISOString().slice(0, 10)
}

const calendarFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

/** A stored calendar date for display, independent of the viewer's zone. */
export function formatCalendarDate(epochMs: number) {
  return calendarFormatter.format(new Date(epochMs))
}
