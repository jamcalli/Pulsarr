import {
  describeContent,
  displayName,
  formatTriggerReason,
  mediaTypeLabel,
} from '@services/notifications/templates/labels.js'
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

describe('displayName', () => {
  it('should prefer the alias', () => {
    expect(displayName({ name: 'john_doe', alias: 'John' }, 7)).toBe('John')
  })

  it('should use the name without an alias', () => {
    expect(displayName({ name: 'john_doe', alias: null }, 7)).toBe('john_doe')
  })

  it('should fall through an empty alias to the name', () => {
    expect(displayName({ name: 'john_doe', alias: '' }, 7)).toBe('john_doe')
  })

  it('should fall back to the user id when both are missing or the user is null', () => {
    expect(displayName({ name: null, alias: null }, 7)).toBe('User 7')
    expect(displayName({}, 7)).toBe('User 7')
    expect(displayName(null, 7)).toBe('User 7')
  })
})

describe('formatTriggerReason', () => {
  it('should put the reason under the trigger label', () => {
    expect(formatTriggerReason('quota_exceeded', 'Monthly quota (5/5)')).toBe(
      'Quota exceeded\nMonthly quota (5/5)',
    )
  })

  it('should return the label alone without a reason', () => {
    expect(formatTriggerReason('router_rule', null)).toBe('Router rule')
  })
})

describe('describeContent', () => {
  it('should name the type after the title', () => {
    expect(describeContent("Don't Breathe", 'movie')).toBe(
      "Don't Breathe (movie)",
    )
  })

  it('should add the episode code and title for a show', () => {
    expect(
      describeContent('Sherlock', 'show', {
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'The Blind Banker',
      }),
    ).toBe('Sherlock (show) S01E02 "The Blind Banker"')
  })

  it('should leave out a missing episode title', () => {
    expect(describeContent('Sherlock', 'show', { seasonNumber: 2 })).toBe(
      'Sherlock (show) S02',
    )
  })
})
