import type { EventItem, ServiceTime } from './contract.js'

/**
 * Rendering helpers that never depend on the viewer's or server's time zone.
 * Event instants render in the event's zone; service times and sermon dates
 * are wall-clock values and render without conversion.
 */

const DAY_REFERENCE = Date.UTC(2023, 0, 1) // a Sunday

export function dayName(day: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(DAY_REFERENCE + day * 86_400_000))
}

/** Formats `HH:MM` as a localized wall-clock time, e.g. `10:30 AM`. */
export function formatWallTime(time: string, locale?: string): string {
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2023, 0, 1, hours, minutes)))
}

export function formatServiceTime(
  service: ServiceTime,
  locale?: string,
): string {
  return `${dayName(service.day, locale)} · ${formatWallTime(service.time, locale)}`
}

/** Formats a calendar date (`YYYY-MM-DD`) without shifting it. */
export function formatCalendarDate(date: string, locale?: string): string {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function zonedParts(instant: string, timeZone: string, locale?: string) {
  const date = new Date(instant)
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date)
  const key = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date)
  return { day, time, key }
}

/** Short zone name in effect at an instant, e.g. `EDT`, `GMT+10`. */
export function zoneLabel(
  instant: string,
  timeZone: string,
  locale?: string,
): string {
  const part = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(new Date(instant))
    .find((entry) => entry.type === 'timeZoneName')
  return part?.value ?? timeZone
}

/**
 * Formats an event's start (and end, when present) in the event's own zone:
 * `Sun, Oct 4, 2026 · 10:00 AM – 11:30 AM EDT`. When the zone's offset changes
 * during the event, each time carries its own label:
 * `Sun, Nov 1, 2026 · 12:30 AM EDT – 3:00 AM EST`.
 */
export function formatEventWhen(event: EventItem, locale?: string): string {
  const start = zonedParts(event.startsAt, event.timezone, locale)
  const startZone = zoneLabel(event.startsAt, event.timezone, locale)
  if (!event.endsAt) return `${start.day} · ${start.time} ${startZone}`
  const end = zonedParts(event.endsAt, event.timezone, locale)
  const endZone = zoneLabel(event.endsAt, event.timezone, locale)
  const from = startZone === endZone ? start.time : `${start.time} ${startZone}`
  return start.key === end.key
    ? `${start.day} · ${from} – ${end.time} ${endZone}`
    : `${start.day} · ${from} – ${end.day} · ${end.time} ${endZone}`
}

/** Offset-qualified local start time for `<time datetime>`, e.g. `2026-10-04T10:00-04:00`. */
export function localDateTimeAttribute(
  instant: string,
  timeZone: string,
): string {
  const date = new Date(instant)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const offsetMinutes = Math.round((wall - date.getTime()) / 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${offset}`
}

/** True for absolute http(s) URLs; renderers must not emit other schemes. */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
