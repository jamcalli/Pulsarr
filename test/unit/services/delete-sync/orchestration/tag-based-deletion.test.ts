import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { TagCache } from '@services/delete-sync/cache/tag-cache.js'
import {
  executeTagBasedDeletion,
  type TagBasedDeletionDeps,
} from '@services/delete-sync/orchestration/tag-based-deletion.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../helpers/deferred.js'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('executeTagBasedDeletion', () => {
  let radarrService: {
    getTags: ReturnType<typeof vi.fn>
    deleteFromRadarr: ReturnType<typeof vi.fn>
  }
  let deps: TagBasedDeletionDeps

  const movies = [
    {
      id: 1,
      title: 'Tagged Movie',
      tags: [1],
      radarr_instance_id: 1,
      guids: 'tmdb://11111',
    } as unknown as RadarrItem,
  ]

  beforeEach(() => {
    radarrService = {
      getTags: vi.fn(),
      deleteFromRadarr: vi.fn(),
    }
    deps = {
      config: {
        removedTagPrefix: 'pulsarr:removed',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        deleteFiles: false,
        maxDeletionPrevention: 100,
      },
      sonarrManager: {
        getSonarrService: vi.fn(),
      } as unknown as SonarrManagerService,
      radarrManager: {
        getRadarrService: vi.fn(() => radarrService),
      } as unknown as RadarrManagerService,
      tagCache: new TagCache(),
      protectedGuids: null,
      trackedGuids: null,
      exclusionDrivenGuids: { movie: new Set(), show: new Set() },
      deletedMovieGuids: new Set(),
      deletedShowGuids: new Set(),
      logger: createMockLogger(),
      protectionPlaylistName: 'Do Not Delete',
      setProtectedGuids: vi.fn(),
      setTrackedGuids: vi.fn(),
    }
  })

  it('aborts without deleting when the tag fetch fails during counting', async () => {
    radarrService.getTags.mockRejectedValue(new Error('Radarr unreachable'))

    const result = await executeTagBasedDeletion(
      [] as SonarrItem[],
      movies,
      deps,
    )

    expect(result.safetyTriggered).toBe(true)
    expect(result.total.deleted).toBe(0)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
  })

  it('waits for the other counter to settle before aborting', async () => {
    const sonarrService = {
      getTags: vi.fn().mockRejectedValue(new Error('Sonarr unreachable')),
    }
    vi.mocked(deps.sonarrManager.getSonarrService).mockReturnValue(
      sonarrService as unknown as ReturnType<
        SonarrManagerService['getSonarrService']
      >,
    )
    deps.config.deleteEndedShow = true
    const radarrTags = createDeferred<Array<{ id: number; label: string }>>()
    radarrService.getTags.mockReturnValue(radarrTags.promise)
    const series = [
      {
        id: 2,
        title: 'Ended Show',
        tags: [],
        series_status: 'ended',
        sonarr_instance_id: 1,
        guids: 'tvdb://22222',
      } as unknown as SonarrItem,
    ]

    let settled = false
    const run = executeTagBasedDeletion(series, movies, deps).then((result) => {
      settled = true
      return result
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)

    radarrTags.resolve([{ id: 1, label: 'pulsarr:removed' }])
    const result = await run

    expect(result.safetyTriggered).toBe(true)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
  })

  it('deletes a tagged movie when the tag fetch succeeds', async () => {
    radarrService.getTags.mockResolvedValue([
      { id: 1, label: 'pulsarr:removed' },
    ])

    const result = await executeTagBasedDeletion(
      [] as SonarrItem[],
      movies,
      deps,
    )

    expect(result.safetyTriggered).toBeFalsy()
    expect(radarrService.deleteFromRadarr).toHaveBeenCalledOnce()
  })
})
