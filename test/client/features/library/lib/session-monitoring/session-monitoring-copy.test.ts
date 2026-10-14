import {
  autoResetHelp,
  checkSummary,
  enrollmentFailure,
  enrollmentSummary,
  liveConnectionLine,
  namedShows,
  resetShowCopy,
} from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { setFormatLocale } from '@/lib/format'

describe('session monitoring copy', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('builds the live line from the polling interval', () => {
    expect(liveConnectionLine('disconnected', 1)).toBe(
      'Live connection down. Polling every 1 minute until it is back.',
    )
    expect(liveConnectionLine('connected', 15)).toContain('15 minutes')
  })

  it('counts a check result', () => {
    expect(
      checkSummary({
        processedSessions: 3,
        triggeredSearches: 1,
        errors: [],
        rollingUpdates: [],
      }),
    ).toBe('3 sessions processed, 1 search triggered, 0 rolling changes.')
  })

  it('names up to six shows, then counts them', () => {
    expect(namedShows(['Dark', 'Silo'])).toContain('Silo')
    expect(namedShows(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe(
      'These 7 shows',
    )
  })

  it('leaves the viewer clause out of a reset nobody watched', () => {
    expect(resetShowCopy('Dark', 'pilotRolling', 'Sonarr', 0)).toEqual([
      'Dark goes back to the pilot only.',
      'Episode files rolling added are deleted from Sonarr.',
    ])
  })

  it('names the period while the draft has none', () => {
    expect(autoResetHelp(undefined)).toBe(
      'Reset shows with no watching or changes for the inactivity period.',
    )
    expect(autoResetHelp(1)).toBe(
      'Reset shows with no watching or changes for 1 day.',
    )
  })

  it('summarizes an enrollment', () => {
    expect(enrollmentSummary(4, 1)).toBe('3 of 4 shows updated.')
    expect(enrollmentFailure(1)).toBe('1 show was not updated.')
  })
})
