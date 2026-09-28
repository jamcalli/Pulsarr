import type { UserMapEntry } from '@root/types/plex.types.js'
import {
  lookupUserByUuid,
  refreshPlexUuidCache,
  updatePlexUuidCache,
} from '@services/watchlist-workflow/cache/uuid-cache.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

function friendChanges(userMap: Map<string, UserMapEntry>) {
  return { added: [], removed: [], userMap }
}

describe('lookupUserByUuid', () => {
  it('returns the cached user id without reaching Plex', async () => {
    const checkFriendChanges = vi.fn()
    const deps = createWorkflowDeps({ plexService: { checkFriendChanges } })
    const cache = new Map<string, UserMapEntry>([
      ['uuid-a', { userId: 7, username: 'friend-a' }],
    ])

    const result = await lookupUserByUuid('uuid-a', cache, deps)

    expect(result.userId).toBe(7)
    expect(result.cache).toBe(cache)
    expect(checkFriendChanges).not.toHaveBeenCalled()
  })

  it('refreshes once on a miss and returns the refreshed cache', async () => {
    const checkFriendChanges = vi.fn(async () =>
      friendChanges(
        new Map<string, UserMapEntry>([
          ['uuid-b', { userId: 9, username: 'friend-b' }],
        ]),
      ),
    )
    const deps = createWorkflowDeps({ plexService: { checkFriendChanges } })
    const cache = new Map<string, UserMapEntry>()

    const result = await lookupUserByUuid('uuid-b', cache, deps)

    expect(checkFriendChanges).toHaveBeenCalledTimes(1)
    expect(result.userId).toBe(9)
    expect(result.cache).not.toBe(cache)
    expect(result.cache.get('uuid-b')).toEqual({
      userId: 9,
      username: 'friend-b',
    })
  })

  it('returns null when the refreshed cache still lacks the author', async () => {
    const checkFriendChanges = vi.fn(async () =>
      friendChanges(
        new Map<string, UserMapEntry>([
          ['uuid-other', { userId: 4, username: 'friend-other' }],
        ]),
      ),
    )
    const deps = createWorkflowDeps({ plexService: { checkFriendChanges } })

    const result = await lookupUserByUuid(
      'uuid-missing',
      new Map<string, UserMapEntry>(),
      deps,
    )

    expect(result.userId).toBeNull()
    expect(result.cache.has('uuid-missing')).toBe(false)
  })

  it('keeps the original cache when the refresh throws', async () => {
    const checkFriendChanges = vi
      .fn()
      .mockRejectedValue(new Error('plex unreachable'))
    const deps = createWorkflowDeps({ plexService: { checkFriendChanges } })
    const cache = new Map<string, UserMapEntry>([
      ['uuid-a', { userId: 7, username: 'friend-a' }],
    ])

    const result = await lookupUserByUuid('uuid-missing', cache, deps)

    expect(result.userId).toBeNull()
    expect(result.cache).toBe(cache)
  })
})

describe('refreshPlexUuidCache', () => {
  it('rebuilds the cache from the fetched user map', async () => {
    const checkFriendChanges = vi.fn(async () =>
      friendChanges(
        new Map<string, UserMapEntry>([
          ['uuid-b', { userId: 9, username: 'friend-b' }],
          ['uuid-c', { userId: 3, username: 'friend-c' }],
        ]),
      ),
    )
    const deps = createWorkflowDeps({ plexService: { checkFriendChanges } })
    const cache = new Map<string, UserMapEntry>([
      ['uuid-stale', { userId: 1, username: 'friend-stale' }],
    ])

    const refreshed = await refreshPlexUuidCache(cache, deps)

    expect([...refreshed.keys()]).toEqual(['uuid-b', 'uuid-c'])
  })
})

describe('updatePlexUuidCache', () => {
  it('returns a copy that survives mutation of the source map', () => {
    const source = new Map<string, UserMapEntry>([
      ['uuid-c', { userId: 3, username: 'friend-c' }],
    ])

    const copy = updatePlexUuidCache(source, createMockLogger())

    expect(copy).not.toBe(source)
    source.delete('uuid-c')
    expect(copy.get('uuid-c')).toEqual({ userId: 3, username: 'friend-c' })
  })
})
