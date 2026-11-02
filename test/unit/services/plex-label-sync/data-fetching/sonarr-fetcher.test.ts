import { fetchSonarrTagsForItem } from '@services/plex-label-sync/data-fetching/sonarr-fetcher.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function managerWith(series: { id: number; title: string; tags?: number[] }) {
  const findInLibrary = vi.fn(async (tvdbId: number) =>
    tvdbId === 100 ? series : undefined,
  )
  const getTags = vi.fn(async () => [
    { id: 1, label: 'anime' },
    { id: 2, label: 'pulsarr-user-alice' },
  ])
  const manager = {
    getSonarrService: () => ({ findInLibrary, getTags }),
  } as unknown as SonarrManagerService
  return { manager, findInLibrary, getTags }
}

describe('fetchSonarrTagsForItem', () => {
  it('reads the series from the local library and drops user tagging tags', async () => {
    const { manager, findInLibrary } = managerWith({
      id: 7,
      title: 'Show',
      tags: [1, 2, 3],
    })

    const tags = await fetchSonarrTagsForItem(
      manager,
      [1],
      100,
      'Show',
      (tag) => tag.startsWith('pulsarr-user-'),
      createMockLogger(),
    )

    expect(tags).toEqual(['anime'])
    expect(findInLibrary).toHaveBeenCalledWith(100)
  })

  it('returns no tags when the series is not in the library', async () => {
    const { manager, getTags } = managerWith({ id: 7, title: 'Show' })

    const tags = await fetchSonarrTagsForItem(
      manager,
      [1],
      200,
      'Show',
      () => false,
      createMockLogger(),
    )

    expect(tags).toEqual([])
    expect(getTags).not.toHaveBeenCalled()
  })
})
