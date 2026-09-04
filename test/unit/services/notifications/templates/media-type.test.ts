import { mediaTypeLabel } from '@services/notifications/templates/media-type.js'
import { describe, expect, it } from 'vitest'

describe('mediaTypeLabel', () => {
  it('should label a movie', () => {
    expect(mediaTypeLabel('movie')).toEqual({ label: 'Movie', emoji: '🎬' })
  })

  it('should label every show alias', () => {
    for (const type of ['show', 'tv', 'series']) {
      expect(mediaTypeLabel(type)).toEqual({ label: 'Show', emoji: '📺' })
    }
  })

  it('should ignore casing', () => {
    expect(mediaTypeLabel('Series').label).toBe('Show')
    expect(mediaTypeLabel('MOVIE').label).toBe('Movie')
  })

  it('should fall back to media for an unknown or empty type', () => {
    expect(mediaTypeLabel('book')).toEqual({ label: 'Media', emoji: '🎬' })
    expect(mediaTypeLabel('')).toEqual({ label: 'Media', emoji: '🎬' })
  })
})
