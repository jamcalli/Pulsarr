import {
  buildGuidIndex,
  usersForGuids,
} from '@services/user-tags/matching/guid-index.js'
import { describe, expect, it } from 'vitest'

describe('guid-index', () => {
  it('indexes every guid of every watchlist item to its user', () => {
    const index = buildGuidIndex([
      { user_id: 1, guids: ['tmdb:1', 'imdb:tt1'] },
      { user_id: 2, guids: ['tmdb:2'] },
    ])

    expect(index.get('tmdb:1')).toEqual(new Set([1]))
    expect(index.get('imdb:tt1')).toEqual(new Set([1]))
    expect(index.get('tmdb:2')).toEqual(new Set([2]))
  })

  it('returns each user once when several guids or items match', () => {
    const index = buildGuidIndex([
      { user_id: 1, guids: ['tmdb:1', 'imdb:tt1'] },
      { user_id: 1, guids: ['tvdb:5'] },
      { user_id: 2, guids: ['imdb:tt1'] },
    ])

    expect(usersForGuids(index, ['tmdb:1', 'imdb:tt1', 'tvdb:5'])).toEqual(
      new Set([1, 2]),
    )
  })

  it('returns an empty set when nothing matches', () => {
    const index = buildGuidIndex([{ user_id: 1, guids: ['tmdb:1'] }])

    expect(usersForGuids(index, ['tmdb:2'])).toEqual(new Set())
    expect(usersForGuids(index, undefined)).toEqual(new Set())
  })

  it('accepts JSON string guids as well as arrays', () => {
    const index = buildGuidIndex([
      { user_id: 3, guids: JSON.stringify(['tmdb:9']) },
      { user_id: 4, guids: undefined },
    ])

    expect(usersForGuids(index, JSON.stringify(['tmdb:9']))).toEqual(
      new Set([3]),
    )
  })

  it('normalizes case and provider separators on both sides', () => {
    const index = buildGuidIndex([{ user_id: 1, guids: ['TMDB://42'] }])

    expect(index.has('tmdb:42')).toBe(true)
    expect(usersForGuids(index, ['Tmdb://42'])).toEqual(new Set([1]))
  })
})
