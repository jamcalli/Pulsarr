import {
  extractUuidFromThumb,
  indexPlexUsersByUuid,
} from '@utils/plex-avatar.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('extractUuidFromThumb', () => {
  it('returns the uuid from a plex.tv avatar url', () => {
    expect(
      extractUuidFromThumb('https://plex.tv/users/abc123/avatar?c=1'),
    ).toBe('abc123')
  })

  it('returns null for a missing or foreign thumb', () => {
    expect(extractUuidFromThumb(undefined)).toBeNull()
    expect(extractUuidFromThumb('/library/metadata/1/thumb')).toBeNull()
  })
})

describe('indexPlexUsersByUuid', () => {
  it('keys server users by their thumb uuid and skips users without one', () => {
    const withUuid = {
      id: '1',
      username: 'alice',
      title: 'Alice',
      thumb: 'https://plex.tv/users/abc123/avatar',
    }
    const foreignThumb = {
      id: '2',
      username: 'bob',
      title: 'Bob',
      thumb: '/library/metadata/1/thumb',
    }
    const noThumb = { id: '3', username: 'cal', title: 'Cal' }

    const byUuid = indexPlexUsersByUuid(
      [withUuid, foreignThumb, noThumb],
      createMockLogger(),
    )

    expect([...byUuid]).toEqual([['abc123', withUuid]])
  })
})
