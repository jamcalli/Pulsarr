import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock('@services/delete-sync/cleanup/approval-cleanup.js', () => ({
  cleanupOrphanedApprovalRequests: vi.fn(async () => {}),
  cleanupApprovalRequestsForDeletedContent: vi.fn(async () => {}),
}))

vi.mock('@services/delete-sync/cleanup/rolling-monitor-cleanup.js', () => ({
  cleanupRollingMonitoredShowsForDeletedContent: vi.fn(async () => {}),
}))

import {
  cleanupApprovalRequestsForDeletedContent,
  cleanupOrphanedApprovalRequests,
} from '@services/delete-sync/cleanup/approval-cleanup.js'
import { cleanupRollingMonitoredShowsForDeletedContent } from '@services/delete-sync/cleanup/rolling-monitor-cleanup.js'
import { DeleteSyncService } from '@services/delete-sync.service.js'

const REMOVED_TAG = 7

function movie(tags: number[]): RadarrItem {
  return {
    title: 'Re-added Movie',
    guids: ['tmdb:11111', 'radarr:1'],
    type: 'movie',
    tags,
    radarr_instance_id: 1,
  } as RadarrItem
}

const taggingOk = {
  tagged: 1,
  skipped: 0,
  failed: 0,
  failedInstances: 0,
}

function createService() {
  const radarrService = {
    getTags: vi.fn(async () => [{ id: REMOVED_TAG, label: 'pulsarr:removed' }]),
    deleteFromRadarr: vi.fn(async () => {}),
  }
  const fetchAllMovies = vi.fn(async () => [movie([REMOVED_TAG])])
  const tagRadarrContentWithData = vi.fn(async () => taggingOk)
  const sendDeleteSyncNotification = vi.fn(async () => {})
  const getTrackedContentGuids = vi.fn(async () => new Set<string>())
  const config = {
    deletionMode: 'tag-based',
    deleteMovie: true,
    deleteEndedShow: false,
    deleteContinuingShow: false,
    deleteFiles: false,
    deleteSyncTrackedOnly: false,
    enablePlexPlaylistProtection: false,
    removedTagPrefix: 'pulsarr:removed',
    maxDeletionPrevention: 100,
    tagUsersInRadarr: true,
    tagUsersInSonarr: false,
  }
  const fastify = {
    config,
    db: {
      getAllMovieWatchlistItems: vi.fn(async () => []),
      getAllShowWatchlistItems: vi.fn(async () => []),
      getExclusionDrivenDeletionGuids: vi.fn(async () => ({
        movie: new Set<string>(),
        show: new Set<string>(),
      })),
      getTrackedContentGuids,
    },
    sonarrManager: {
      fetchAllSeries: vi.fn(async () => []),
      getSonarrService: vi.fn(),
    },
    radarrManager: {
      fetchAllMovies,
      getRadarrService: vi.fn(() => radarrService),
    },
    plexServerService: {
      clearWorkflowCaches: vi.fn(),
      isInitialized: vi.fn(() => true),
    },
    plexWatchlist: {
      getSelfWatchlist: vi.fn(async () => {}),
      getOthersWatchlists: vi.fn(async () => {}),
    },
    userTags: {
      tagRadarrContentWithData,
      tagSonarrContentWithData: vi.fn(async () => taggingOk),
    },
    notifications: { sendDeleteSyncNotification },
  }
  const service = new DeleteSyncService(
    createMockLogger(),
    fastify as unknown as FastifyInstance,
  )
  return {
    service,
    config,
    radarrService,
    fetchAllMovies,
    tagRadarrContentWithData,
    sendDeleteSyncNotification,
    getTrackedContentGuids,
  }
}

function expectNoCleanup() {
  expect(cleanupOrphanedApprovalRequests).not.toHaveBeenCalled()
  expect(cleanupApprovalRequestsForDeletedContent).not.toHaveBeenCalled()
  expect(cleanupRollingMonitoredShowsForDeletedContent).not.toHaveBeenCalled()
}

describe('DeleteSyncService.run in tag-based mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a movie that still carries the removal tag after tagging', async () => {
    const { service, radarrService } = createService()

    const result = await service.run()

    expect(result.safetyTriggered).toBeFalsy()
    expect(radarrService.deleteFromRadarr).toHaveBeenCalledOnce()
    expect(cleanupOrphanedApprovalRequests).toHaveBeenCalledOnce()
  })

  it('keeps a re-added movie whose removal tag tagging just stripped', async () => {
    const { service, radarrService, fetchAllMovies } = createService()
    fetchAllMovies
      .mockResolvedValueOnce([movie([REMOVED_TAG])])
      .mockResolvedValueOnce([movie([])])

    const result = await service.run()

    expect(fetchAllMovies).toHaveBeenCalledTimes(2)
    expect(result.movies.deleted).toBe(0)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
  })

  it('aborts with a safety result when tagging throws', async () => {
    const { service, radarrService, tagRadarrContentWithData } = createService()
    tagRadarrContentWithData.mockRejectedValueOnce(new Error('Radarr down'))

    const result = await service.run()

    expect(result.safetyTriggered).toBe(true)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
  })

  it('aborts with a safety result when an instance failed to tag', async () => {
    const {
      service,
      radarrService,
      tagRadarrContentWithData,
      sendDeleteSyncNotification,
    } = createService()
    tagRadarrContentWithData.mockResolvedValueOnce({
      ...taggingOk,
      failedInstances: 1,
    })

    const result = await service.run()

    expect(result.safetyTriggered).toBe(true)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
    expect(sendDeleteSyncNotification).toHaveBeenCalledOnce()
    expectNoCleanup()
  })

  it('aborts with a safety result when an item failed to tag', async () => {
    const { service, radarrService, tagRadarrContentWithData } = createService()
    tagRadarrContentWithData.mockResolvedValueOnce({ ...taggingOk, failed: 1 })

    const result = await service.run()

    expect(result.safetyTriggered).toBe(true)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
  })

  it('notifies once and skips cleanup when the tracked loader fails', async () => {
    const {
      service,
      config,
      getTrackedContentGuids,
      sendDeleteSyncNotification,
    } = createService()
    config.deleteSyncTrackedOnly = true
    getTrackedContentGuids.mockRejectedValueOnce(new Error('db locked'))

    const result = await service.run()

    expect(result.safetyTriggered).toBe(true)
    expect(sendDeleteSyncNotification).toHaveBeenCalledOnce()
    expectNoCleanup()
  })

  it('notifies once and skips cleanup when the deletion safety check aborts', async () => {
    const { service, radarrService, sendDeleteSyncNotification } =
      createService()
    radarrService.getTags.mockRejectedValueOnce(new Error('Radarr down'))

    const result = await service.run()

    expect(result.safetyTriggered).toBe(true)
    expect(radarrService.deleteFromRadarr).not.toHaveBeenCalled()
    expect(sendDeleteSyncNotification).toHaveBeenCalledOnce()
    expectNoCleanup()
  })
})
