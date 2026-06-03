import type { PlexPlaySessionNotification } from '@root/types/plex-session.types.js'
import { normalizePlayingNotification } from '@services/plex-server/sse/plex-event-source.js'
import { describe, expect, it } from 'vitest'

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

describe('normalizePlayingNotification', () => {
  it('rewrites buffering to playing', () => {
    const input = makeNotification({ state: 'buffering' })
    const out = normalizePlayingNotification(input)
    expect(out.state).toBe('playing')
  })

  it('preserves every other field when rewriting buffering', () => {
    const input = makeNotification({
      state: 'buffering',
      sessionKey: '999',
      viewOffset: 42,
    })
    const out = normalizePlayingNotification(input)
    expect(out).toEqual({ ...input, state: 'playing' })
  })

  it('does not mutate the input when rewriting', () => {
    const input = makeNotification({ state: 'buffering' })
    normalizePlayingNotification(input)
    expect(input.state).toBe('buffering')
  })

  it('passes playing through unchanged', () => {
    const input = makeNotification({ state: 'playing' })
    expect(normalizePlayingNotification(input)).toBe(input)
  })

  it.each([
    'paused',
    'stopped',
    'error',
  ] as const)('passes %s through unchanged', (state) => {
    const input = makeNotification({ state })
    expect(normalizePlayingNotification(input)).toBe(input)
  })
})
