import { describe, expect, it } from 'vitest'
import {
  calendarDateToEpoch,
  epochToCalendarDate,
  formatCalendarDate,
  formatInTimeZone,
  fromZonedInputValue,
  isValidTimeZone,
  toZonedInputValue,
} from '../../src/lib/time-zone'

/*
 * These helpers take the zone explicitly, so their results cannot depend on
 * the timezone of the browser that runs them.
 */

describe('event wall-clock times in an explicit zone', () => {
  it('reads a datetime-local value in the given zone', () => {
    expect(fromZonedInputValue('2026-10-04T10:00', 'America/New_York')).toBe(
      Date.UTC(2026, 9, 4, 14),
    )
    expect(fromZonedInputValue('2026-10-04T10:00', 'America/Los_Angeles')).toBe(
      Date.UTC(2026, 9, 4, 17),
    )
    expect(fromZonedInputValue('2026-12-06T10:00', 'America/Chicago')).toBe(
      Date.UTC(2026, 11, 6, 16),
    )
    expect(fromZonedInputValue('2026-10-04T10:00', 'Asia/Kathmandu')).toBe(
      Date.UTC(2026, 9, 4, 4, 15),
    )
    expect(fromZonedInputValue('2026-10-04T10:00', 'UTC')).toBe(
      Date.UTC(2026, 9, 4, 10),
    )
  })

  it('shows an instant as the wall-clock time in the given zone', () => {
    expect(
      toZonedInputValue(Date.UTC(2026, 9, 4, 14), 'America/New_York'),
    ).toBe('2026-10-04T10:00')
    expect(toZonedInputValue(Date.UTC(2026, 9, 4, 3), 'America/Chicago')).toBe(
      '2026-10-03T22:00',
    )
    expect(
      toZonedInputValue(Date.UTC(2026, 11, 31, 23, 30), 'Pacific/Kiritimati'),
    ).toBe('2027-01-01T13:30')
    expect(toZonedInputValue(Date.UTC(2026, 0, 1, 0), 'America/New_York')).toBe(
      '2025-12-31T19:00',
    )
  })

  it('round-trips wall-clock values in zones with unusual offsets', () => {
    for (const zone of [
      'America/St_Johns',
      'Asia/Kathmandu',
      'Australia/Lord_Howe',
      'Pacific/Chatham',
      'Europe/London',
    ]) {
      for (const value of [
        '2026-01-15T09:45',
        '2026-07-15T18:05',
        '2026-12-31T23:59',
      ]) {
        expect(toZonedInputValue(fromZonedInputValue(value, zone), zone)).toBe(
          value,
        )
      }
    }
  })

  it('resolves daylight-saving gaps forward and overlaps to the earlier time', () => {
    // 02:30 does not exist in New York on 8 March 2026; it means 03:30 EDT.
    expect(fromZonedInputValue('2026-03-08T02:30', 'America/New_York')).toBe(
      Date.UTC(2026, 2, 8, 7, 30),
    )
    // 01:30 happens twice on 1 November 2026; the first is 01:30 EDT.
    expect(fromZonedInputValue('2026-11-01T01:30', 'America/New_York')).toBe(
      Date.UTC(2026, 10, 1, 5, 30),
    )
  })

  it('rejects unknown zones and malformed values', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(() => fromZonedInputValue('2026-10-04T10:00', 'Nowhere')).toThrow(
      RangeError,
    )
    expect(fromZonedInputValue('10/04/2026 10:00', 'UTC')).toBeNaN()
  })

  it('formats an instant in the given zone for staff lists', () => {
    expect(formatInTimeZone(Date.UTC(2026, 9, 20, 15), 'America/Chicago')).toBe(
      'Oct 20, 2026, 10:00 AM',
    )
    expect(formatInTimeZone(Date.UTC(2026, 9, 20, 15), 'Asia/Tokyo')).toBe(
      'Oct 21, 2026, 12:00 AM',
    )
  })
})

describe('sermon calendar dates', () => {
  it('stores a chosen date at noon UTC and reads the same date back', () => {
    expect(calendarDateToEpoch('2026-09-20')).toBe(Date.UTC(2026, 8, 20, 12))
    expect(epochToCalendarDate(Date.UTC(2026, 8, 20, 12))).toBe('2026-09-20')
    expect(formatCalendarDate(Date.UTC(2026, 8, 20, 12))).toBe('Sep 20, 2026')
    expect(calendarDateToEpoch('')).toBeNaN()
  })
})
