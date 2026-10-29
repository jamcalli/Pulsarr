import { fetchRadarrTagsForItem } from '@services/plex-label-sync/data-fetching/radarr-fetcher.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function managerWith(movie: { id: number; title: string; tags?: number[] }) {
  const findInLibrary = vi.fn(async (tmdbId: number) =>
    tmdbId === 100 ? movie : undefined,
  )
  const getTags = vi.fn(async () => [
    { id: 1, label: 'anime' },
    { id: 2, label: 'pulsarr-user-alice' },
  ])
  const manager = {
    getRadarrService: () => ({ findInLibrary, getTags }),
  } as unknown as RadarrManagerService
  return { manager, findInLibrary, getTags }
}

describe('fetchRadarrTagsForItem', () => {
  it('reads the movie from the local library and drops user tagging tags', async () => {
    const { manager, findInLibrary } = managerWith({
      id: 7,
      title: 'Movie',
      tags: [1, 2, 3],
    })

    const tags = await fetchRadarrTagsForItem(
      manager,
      [1],
      100,
      'Movie',
      (tag) => tag.startsWith('pulsarr-user-'),
      createMockLogger(),
    )

    expect(tags).toEqual(['anime'])
    expect(findInLibrary).toHaveBeenCalledWith(100)
  })

  it('returns no tags when the movie is not in the library', async () => {
    const { manager, getTags } = managerWith({ id: 7, title: 'Movie' })

    const tags = await fetchRadarrTagsForItem(
      manager,
      [1],
      200,
      'Movie',
      () => false,
      createMockLogger(),
    )

    expect(tags).toEqual([])
    expect(getTags).not.toHaveBeenCalled()
  })
})
