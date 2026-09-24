import type { PlexPlaySessionNotification } from '@root/types/plex-session.types.js'
import { SessionTracker } from '@services/plex-server/sse/session-tracker.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEpisodeSession } from '../../../../helpers/session-monitor-fixtures.js'
import { createMockLogger } from '../../../../mocks/logger.js'

function makeNotification(
  overrides: Partial<PlexPlaySessionNotification> = {},
): PlexPlaySessionNotification {
  return {
    sessionKey: '322',
    clientIdentifier: 'zmupu10q',
    guid: 'plex://episode/abc',
    ratingKey: '109498',
    url: '',
    key: '/library/metadata/109498',
    viewOffset: 1_234_000,
    playQueueItemID: 169073,
    state: 'playing',
    ...overrides,
  }
}

describe('SessionTracker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires on the first event for a new sessionKey', () => {
    const tracker = new SessionTracker(createMockLogger())

    expect(tracker.handlePlayingEvent(makeNotification())).toBe(true)
  })

  it('stays quiet on state changes for the same pair', () => {
    const tracker = new SessionTracker(createMockLogger())
    const states = [
      'buffering',
      'playing',
      'playing',
      'paused',
      'playing',
      'stopped',
    ] as const

    const fired = states.map((state) =>
      tracker.handlePlayingEvent(makeNotification({ state })),
    )

    expect(fired).toEqual([true, false, false, false, false, false])
  })

  it('fires when a tracked session moves to a new ratingKey in the same state', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification({ ratingKey: '100' }))

    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '101' })),
    ).toBe(true)
    expect(tracker.getTrackedSessions().get('322')?.ratingKey).toBe('101')
  })

  it('keeps the entry after stopped so only a new ratingKey fires', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification({ ratingKey: '100' }))
    tracker.handlePlayingEvent(
      makeNotification({ ratingKey: '100', state: 'stopped' }),
    )

    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '100' })),
    ).toBe(false)
    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '101' })),
    ).toBe(true)
  })

  it('ignores stopped for an unknown sessionKey without tracking it', () => {
    const tracker = new SessionTracker(createMockLogger())

    expect(
      tracker.handlePlayingEvent(makeNotification({ state: 'stopped' })),
    ).toBe(false)
    expect(tracker.getTrackedSessions().size).toBe(0)
  })

  it('ignores an empty incoming ratingKey on a tracked session', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification({ ratingKey: '100' }))

    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '' })),
    ).toBe(false)
    expect(tracker.getTrackedSessions().get('322')?.ratingKey).toBe('100')
  })

  it('adopts the first real ratingKey when the stored one is empty', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification({ ratingKey: '' }))

    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '100' })),
    ).toBe(false)
    expect(tracker.getTrackedSessions().get('322')?.ratingKey).toBe('100')
    expect(
      tracker.handlePlayingEvent(makeNotification({ ratingKey: '101' })),
    ).toBe(true)
  })

  it('hydrates only untracked sessions and treats hydrated pairs as seen', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(
      makeNotification({ sessionKey: 'sess-nicole', ratingKey: '999' }),
    )

    const session = makeEpisodeSession({ season: 4, episode: 7 })
    const other = { ...session, sessionKey: 'sess-other' }

    expect(tracker.hydrate([session, other])).toBe(1)
    expect(tracker.getTrackedSessions().get('sess-nicole')?.ratingKey).toBe(
      '999',
    )
    expect(
      tracker.handlePlayingEvent(
        makeNotification({
          sessionKey: 'sess-other',
          ratingKey: session.ratingKey,
        }),
      ),
    ).toBe(false)
  })

  it('forget removes the entry so the same pair fires again', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification())

    tracker.forget('322')

    expect(tracker.handlePlayingEvent(makeNotification())).toBe(true)
  })

  it('forget on an unknown sessionKey is a no-op', () => {
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification())

    tracker.forget('unknown')

    expect(tracker.getTrackedSessions().size).toBe(1)
    expect(tracker.handlePlayingEvent(makeNotification())).toBe(false)
  })

  it('clear then hydrate re-seeds live sessions and drops the rest', () => {
    const tracker = new SessionTracker(createMockLogger())
    const session = makeEpisodeSession({ season: 4, episode: 7 })
    tracker.handlePlayingEvent(
      makeNotification({
        sessionKey: session.sessionKey,
        ratingKey: session.ratingKey,
      }),
    )
    tracker.handlePlayingEvent(makeNotification({ sessionKey: 'recycled' }))

    tracker.clear()
    tracker.hydrate([session])

    expect(
      tracker.handlePlayingEvent(
        makeNotification({
          sessionKey: session.sessionKey,
          ratingKey: session.ratingKey,
        }),
      ),
    ).toBe(false)
    expect(
      tracker.handlePlayingEvent(makeNotification({ sessionKey: 'recycled' })),
    ).toBe(true)
  })

  it('sweeps entries older than maxAgeMs and returns their keys', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const tracker = new SessionTracker(createMockLogger())
    tracker.handlePlayingEvent(makeNotification({ sessionKey: 'old' }))

    vi.setSystemTime(new Date('2026-01-01T00:04:00Z'))
    tracker.handlePlayingEvent(makeNotification({ sessionKey: 'fresh' }))

    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'))

    expect(tracker.sweepStale(5 * 60 * 1000)).toEqual(['old'])
    expect([...tracker.getTrackedSessions().keys()]).toEqual(['fresh'])
  })
})
