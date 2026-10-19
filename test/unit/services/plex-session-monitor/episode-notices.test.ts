import { EpisodeNotices } from '@services/plex-session-monitor/episode-notices.js'
import { describe, expect, it } from 'vitest'

describe('EpisodeNotices', () => {
  it('reports a notice as new only the first time it repeats for a key', () => {
    const notices = new EpisodeNotices()

    expect(notices.isNew('7', 'S01E05 has no statistics')).toBe(true)
    expect(notices.isNew('7', 'S01E05 has no statistics')).toBe(false)
  })

  it('reports the next episode as new', () => {
    const notices = new EpisodeNotices()
    notices.isNew('7', 'S01E05 has no statistics')

    expect(notices.isNew('7', 'S01E06 has no statistics')).toBe(true)
  })

  it('tracks keys independently', () => {
    const notices = new EpisodeNotices()
    notices.isNew('7', 'S01E05 has no statistics')

    expect(notices.isNew('8', 'S01E05 has no statistics')).toBe(true)
  })

  it('reports a notice as new again after a different one for the same key', () => {
    const notices = new EpisodeNotices()
    notices.isNew('7', 'S01E05 has no statistics')
    notices.isNew('7', 'S01E05 instance missing')

    expect(notices.isNew('7', 'S01E05 has no statistics')).toBe(true)
  })
})
