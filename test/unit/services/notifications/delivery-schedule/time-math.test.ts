import {
  fromWallClock,
  getNextTimeOfDay,
  getQuietHoursEnd,
  isWithinQuietHours,
  parseTimeOfDay,
  toWallClock,
  wallClockInstants,
} from '@services/notifications/delivery-schedule/time-math.js'
import { describe, expect, it } from 'vitest'

const LA = 'America/Los_Angeles'
const at = (iso: string) => Date.parse(iso)
const iso = (instant: number | null) =>
  instant === null ? null : new Date(instant).toISOString()

describe('time-math', () => {
  describe('parseTimeOfDay', () => {
    it.each([
      ['00:00', 0],
      ['08:30', 510],
      ['23:59', 1439],
    ])('parses %s', (value, minutes) => {
      expect(parseTimeOfDay(value)).toBe(minutes)
    })

    it.each(['24:00', '7:00', '07:60', '', 'noon'])('rejects %s', (value) => {
      expect(parseTimeOfDay(value)).toBeNull()
    })
  })

  describe('wall clock conversion', () => {
    it('round-trips an ordinary time', () => {
      const instant = fromWallClock(
        { year: 2026, month: 7, day: 1, hour: 9, minute: 15 },
        LA,
      )
      expect(iso(instant)).toBe('2026-07-01T16:15:00.000Z')
      expect(toWallClock(instant, LA)).toEqual({
        year: 2026,
        month: 7,
        day: 1,
        hour: 9,
        minute: 15,
      })
    })

    it('resolves a time skipped by spring-forward to the end of the gap', () => {
      // 2026-03-08 02:00 PST jumps to 03:00 PDT
      const instants = wallClockInstants(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        LA,
      )
      expect(instants.map(iso)).toEqual(['2026-03-08T10:00:00.000Z'])
    })

    it('returns both instants of a time repeated by fall-back', () => {
      // 2026-11-01 02:00 PDT falls back to 01:00 PST
      const instants = wallClockInstants(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        LA,
      )
      expect(instants.map(iso)).toEqual([
        '2026-11-01T08:30:00.000Z',
        '2026-11-01T09:30:00.000Z',
      ])
    })

    it('handles zones with half-hour offsets', () => {
      const instant = fromWallClock(
        { year: 2026, month: 1, day: 10, hour: 22, minute: 0 },
        'Asia/Kolkata',
      )
      expect(iso(instant)).toBe('2026-01-10T16:30:00.000Z')
    })
  })

  describe('isWithinQuietHours', () => {
    const overnight = { start: '22:00', end: '07:00', timeZone: 'UTC' }
    const daytime = { start: '09:00', end: '17:00', timeZone: 'UTC' }

    it.each([
      ['2026-05-01T21:59:00Z', false],
      ['2026-05-01T22:00:00Z', true], // start is inclusive
      ['2026-05-01T23:30:00Z', true],
      ['2026-05-02T00:00:00Z', true], // across midnight
      ['2026-05-02T06:59:00Z', true],
      ['2026-05-02T07:00:00Z', false], // end is exclusive
      ['2026-05-02T12:00:00Z', false],
    ])('overnight window at %s → %s', (time, expected) => {
      expect(isWithinQuietHours(at(time), overnight)).toBe(expected)
    })

    it.each([
      ['2026-05-01T08:59:00Z', false],
      ['2026-05-01T09:00:00Z', true],
      ['2026-05-01T16:59:00Z', true],
      ['2026-05-01T17:00:00Z', false],
      ['2026-05-01T23:00:00Z', false],
    ])('same-day window at %s → %s', (time, expected) => {
      expect(isWithinQuietHours(at(time), daytime)).toBe(expected)
    })

    it('treats start === end as no quiet hours', () => {
      const empty = { start: '08:00', end: '08:00', timeZone: 'UTC' }
      expect(isWithinQuietHours(at('2026-05-01T08:00:00Z'), empty)).toBe(false)
      expect(isWithinQuietHours(at('2026-05-01T20:00:00Z'), empty)).toBe(false)
    })

    it('evaluates the window in the given time zone', () => {
      const window = { start: '22:00', end: '07:00', timeZone: LA }
      // 03:00 PDT
      expect(isWithinQuietHours(at('2026-07-01T10:00:00Z'), window)).toBe(true)
      // 03:00 UTC is 20:00 PDT the previous evening
      expect(isWithinQuietHours(at('2026-07-01T03:00:00Z'), window)).toBe(false)
    })

    it('ignores malformed times', () => {
      const broken = { start: 'late', end: '07:00', timeZone: 'UTC' }
      expect(isWithinQuietHours(at('2026-05-01T23:00:00Z'), broken)).toBe(false)
    })
  })

  describe('getQuietHoursEnd', () => {
    const overnight = { start: '22:00', end: '07:00', timeZone: LA }

    it('returns null outside quiet hours', () => {
      expect(getQuietHoursEnd(at('2026-07-01T19:00:00Z'), overnight)).toBeNull()
    })

    it('ends the next morning when called in the evening half', () => {
      // 23:00 PDT on Jul 1 → 07:00 PDT on Jul 2
      expect(iso(getQuietHoursEnd(at('2026-07-02T06:00:00Z'), overnight))).toBe(
        '2026-07-02T14:00:00.000Z',
      )
    })

    it('ends the same morning when called after midnight', () => {
      // 03:00 PDT on Jul 2 → 07:00 PDT on Jul 2
      expect(iso(getQuietHoursEnd(at('2026-07-02T10:00:00Z'), overnight))).toBe(
        '2026-07-02T14:00:00.000Z',
      )
    })

    it('ends at the exact start boundary instant', () => {
      // exactly 22:00 PDT
      expect(iso(getQuietHoursEnd(at('2026-07-02T05:00:00Z'), overnight))).toBe(
        '2026-07-02T14:00:00.000Z',
      )
    })

    it('spans the spring-forward night (one hour shorter)', () => {
      // 22:00 PST Mar 7 → 07:00 PDT Mar 8: 8 real hours
      const start = at('2026-03-08T06:00:00Z')
      const end = getQuietHoursEnd(start, overnight) as number
      expect(iso(end)).toBe('2026-03-08T14:00:00.000Z')
      expect((end - start) / 3_600_000).toBe(8)
    })

    it('spans the fall-back night (one hour longer)', () => {
      // 22:00 PDT Oct 31 → 07:00 PST Nov 1: 10 real hours
      const start = at('2026-11-01T05:00:00Z')
      const end = getQuietHoursEnd(start, overnight) as number
      expect(iso(end)).toBe('2026-11-01T15:00:00.000Z')
      expect((end - start) / 3_600_000).toBe(10)
    })

    it('ends when the gap closes if the end time is skipped by DST', () => {
      const window = { start: '00:00', end: '02:30', timeZone: LA }
      // 01:30 PST on spring-forward day; 02:30 never happens
      expect(iso(getQuietHoursEnd(at('2026-03-08T09:30:00Z'), window))).toBe(
        '2026-03-08T10:00:00.000Z',
      )
    })

    it('uses the second occurrence of a repeated end time when already past the first', () => {
      const window = { start: '00:00', end: '01:30', timeZone: LA }
      // 01:10 PDT (first pass) → first 01:30
      expect(iso(getQuietHoursEnd(at('2026-11-01T08:10:00Z'), window))).toBe(
        '2026-11-01T08:30:00.000Z',
      )
      // 01:10 PST (second pass) → second 01:30, not tomorrow
      expect(iso(getQuietHoursEnd(at('2026-11-01T09:10:00Z'), window))).toBe(
        '2026-11-01T09:30:00.000Z',
      )
    })
  })

  describe('getNextTimeOfDay', () => {
    it('returns later today when the time is still ahead', () => {
      expect(
        iso(getNextTimeOfDay(at('2026-05-01T06:00:00Z'), '09:00', 'UTC')),
      ).toBe('2026-05-01T09:00:00.000Z')
    })

    it('returns tomorrow when the time has passed', () => {
      expect(
        iso(getNextTimeOfDay(at('2026-05-01T10:00:00Z'), '09:00', 'UTC')),
      ).toBe('2026-05-02T09:00:00.000Z')
    })

    it('is strictly after: exactly at the time rolls to tomorrow', () => {
      expect(
        iso(getNextTimeOfDay(at('2026-05-01T09:00:00Z'), '09:00', 'UTC')),
      ).toBe('2026-05-02T09:00:00.000Z')
    })

    it('honours the time zone across a DST change', () => {
      // 08:00 PST on Mar 7 → 09:00 PST Mar 7 (17:00Z)
      expect(
        iso(getNextTimeOfDay(at('2026-03-07T16:00:00Z'), '09:00', LA)),
      ).toBe('2026-03-07T17:00:00.000Z')
      // 10:00 PST on Mar 7 → 09:00 PDT Mar 8 (16:00Z)
      expect(
        iso(getNextTimeOfDay(at('2026-03-07T18:00:00Z'), '09:00', LA)),
      ).toBe('2026-03-08T16:00:00.000Z')
    })

    it('returns null for malformed times', () => {
      expect(getNextTimeOfDay(Date.now(), '9am', 'UTC')).toBeNull()
    })
  })
})
