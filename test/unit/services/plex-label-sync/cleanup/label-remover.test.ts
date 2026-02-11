/**
 * Unit tests for label-remover module
 *
 * Tests bulk removal of all app-managed labels and label reset operations
 * with proper handling of tracking cleanup and progress events.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PlexLabelTracking } from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type LabelRemoverDeps,
  removeAllLabels,
  resetLabels,
} from '@services/plex-label-sync/cleanup/label-remover.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('label-remover', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockPlexServer: PlexServerService
  let mockDb: DatabaseService
  let mockFastify: FastifyInstance
  let baseDeps: LabelRemoverDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
      updateLabels: vi.fn(),
      removeSpecificLabels: vi.fn(),
    } as unknown as PlexServerService

    mockDb = {
      getAllTrackedLabels: vi.fn(),
      removeTrackedLabels: vi.fn(),
      clearAllLabelTracking: vi.fn(),
      getAllMovieWatchlistItems: vi.fn(),
      getAllShowWatchlistItems: vi.fn(),
      cleanupUserContentTracking: vi.fn(),
      trackPlexLabels: vi.fn(),
    } as unknown as DatabaseService

    const mockProgress = {
      hasActiveConnections: vi.fn().mockReturnValue(false),
      emit: vi.fn(),
    }

    mockFastify = {
      progress: mockProgress,
    } as unknown as FastifyInstance

    const config: PlexLabelSyncConfig = {
      enabled: true,
      labelPrefix: 'pulsarr',
      concurrencyLimit: 5,
      cleanupOrphanedLabels: true,
      removedLabelMode: 'remove',
      removedLabelPrefix: 'pulsarr:removed',
      autoResetOnScheduledSync: false,
      scheduleTime: undefined,
      dayOfWeek: '*',
      tagSync: {
        enabled: false,
        syncRadarrTags: false,
        syncSonarrTags: false,
      },
    }

    baseDeps = {
      plexServer: mockPlexServer,
      db: mockDb,
      logger: mockLogger,
      config,
      fastify: mockFastify,
      labelPrefix: 'pulsarr',
      removedLabelPrefix: 'pulsarr:removed',
      removedLabelMode: 'remove',
    }
  })

  describe('removeAllLabels', () => {
    it('should skip when config disabled', async () => {
      const disabledDeps = {
        ...baseDeps,
        config: { ...baseDeps.config, enabled: false },
      }

      const result = await removeAllLabels(disabledDeps)

      expect(result).toEqual({ processed: 0, removed: 0, failed: 0 })
      expect(mockDb.getAllTrackedLabels).not.toHaveBeenCalled()
    })

    it('should remove all tracked labels successfully', async () => {
      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt0068646'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '67890',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata)
        .mockResolvedValueOnce({
          ratingKey: '12345',
          key: '/library/metadata/12345',
          guid: 'plex://movie/1',
          type: 'movie',
          title: 'Movie 1',
          Label: [{ tag: 'pulsarr:alice' }],
        })
        .mockResolvedValueOnce({
          ratingKey: '67890',
          key: '/library/metadata/67890',
          guid: 'plex://movie/2',
          type: 'movie',
          title: 'Movie 2',
          Label: [{ tag: 'pulsarr:alice' }],
        })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeTrackedLabels).mockResolvedValue({
        processedCount: 2,
        failedIds: [],
        totalUpdatedCount: 2,
      })
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      const result = await removeAllLabels(baseDeps)

      expect(result.processed).toBe(2)
      expect(result.removed).toBe(2)
      expect(result.failed).toBe(0)

      // Verify Plex labels were updated
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('12345', [])
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('67890', [])

      // Verify tracking cleanup
      expect(mockDb.clearAllLabelTracking).toHaveBeenCalled()
    })

    it('should handle items with no current labels gracefully', async () => {
      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/1',
        type: 'movie',
        title: 'Movie 1',
        Label: [], // No labels
      })

      vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeTrackedLabels).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 1,
      })
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      const result = await removeAllLabels(baseDeps)

      expect(result.processed).toBe(1)
      expect(result.removed).toBe(2) // Includes removed prefix
      expect(result.failed).toBe(0)

      // Should use removeSpecificLabels fallback
      expect(mockPlexServer.removeSpecificLabels).toHaveBeenCalledWith(
        '12345',
        expect.arrayContaining(['pulsarr:alice', 'pulsarr:removed']),
      )
    })

    it('should preserve non-app labels', async () => {
      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/1',
        type: 'movie',
        title: 'Movie 1',
        Label: [
          { tag: 'pulsarr:alice' },
          { tag: 'external-label' },
          { tag: 'another-external' },
        ],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeTrackedLabels).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 1,
      })
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      const result = await removeAllLabels(baseDeps)

      expect(result.processed).toBe(1)
      expect(result.removed).toBe(1)
      expect(result.failed).toBe(0)

      // Verify only app labels removed, external labels preserved
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('12345', [
        'external-label',
        'another-external',
      ])
    })

    it('should handle Plex update failures', async () => {
      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/1',
        type: 'movie',
        title: 'Movie 1',
        Label: [{ tag: 'pulsarr:alice' }],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(false)
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      const result = await removeAllLabels(baseDeps)

      expect(result.processed).toBe(1)
      expect(result.removed).toBe(0)
      expect(result.failed).toBe(1)

      // Should still clear tracking even on failure
      expect(mockDb.clearAllLabelTracking).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(mockDb.getAllTrackedLabels).mockRejectedValue(
        new Error('Database error'),
      )

      await expect(removeAllLabels(baseDeps)).rejects.toThrow('Database error')
    })

    it('should emit progress events when connections active', async () => {
      const mockProgress = {
        hasActiveConnections: vi.fn().mockReturnValue(true),
        emit: vi.fn(),
      }

      const depsWithProgress = {
        ...baseDeps,
        fastify: { progress: mockProgress } as unknown as FastifyInstance,
      }

      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/1',
        type: 'movie',
        title: 'Movie 1',
        Label: [{ tag: 'pulsarr:alice' }],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeTrackedLabels).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 1,
      })
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      await removeAllLabels(depsWithProgress)

      // Verify progress events were emitted
      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'plex-label-removal',
          phase: 'start',
        }),
      )

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'plex-label-removal',
          phase: 'complete',
        }),
      )
    })

    it('should group labels by rating key', async () => {
      const mockTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 2,
          plex_rating_key: '12345', // Same rating key
          labels_applied: ['pulsarr:bob'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(mockTracking)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/1',
        type: 'movie',
        title: 'Movie 1',
        Label: [{ tag: 'pulsarr:alice' }, { tag: 'pulsarr:bob' }],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeTrackedLabels).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 2,
      })
      vi.mocked(mockDb.clearAllLabelTracking).mockResolvedValue(0)

      const result = await removeAllLabels(baseDeps)

      // Should process only once (grouped by rating key)
      expect(result.processed).toBe(1)
      expect(result.removed).toBe(2) // Both labels removed

      // Verify single Plex update
      expect(mockPlexServer.updateLabels).toHaveBeenCalledTimes(1)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('12345', [])
    })
  })

  describe('resetLabels', () => {
    it('should skip when config disabled', async () => {
      const disabledDeps = {
        ...baseDeps,
        config: { ...baseDeps.config, enabled: false },
      }

      const result = await resetLabels([], disabledDeps)

      expect(result).toEqual({ processed: 0, updated: 0, failed: 0 })
      expect(mockDb.getAllTrackedLabels).not.toHaveBeenCalled()
    })

    it('should fetch watchlist items when not provided', async () => {
      vi.mocked(mockDb.getAllMovieWatchlistItems).mockResolvedValue([])
      vi.mocked(mockDb.getAllShowWatchlistItems).mockResolvedValue([])

      const result = await resetLabels(undefined, baseDeps)

      expect(mockDb.getAllMovieWatchlistItems).toHaveBeenCalled()
      expect(mockDb.getAllShowWatchlistItems).toHaveBeenCalled()
      expect(result).toEqual({ processed: 0, updated: 0, failed: 0 })
    })

    it('should return early when no watchlist items', async () => {
      const result = await resetLabels([], baseDeps)

      expect(result).toEqual({ processed: 0, updated: 0, failed: 0 })
      expect(mockDb.getAllTrackedLabels).not.toHaveBeenCalled()
    })

    it('should find and cleanup orphaned tracking entries in remove mode', async () => {
      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt9999999'], // Orphaned
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '67890',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)
      vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(true)
      vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

      const result = await resetLabels(watchlistItems, baseDeps)

      // Should find 1 orphaned entry
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)

      // Should remove orphaned labels from Plex
      expect(mockPlexServer.removeSpecificLabels).toHaveBeenCalledWith(
        '67890',
        ['pulsarr:alice'],
      )

      // Should cleanup orphaned tracking
      expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
        ['imdb:tt9999999'],
        'movie',
        1,
      )
    })

    it('should preserve orphaned entries in keep mode', async () => {
      const depsKeep = { ...baseDeps, removedLabelMode: 'keep' as const }

      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt9999999'], // Orphaned
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '67890',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)

      const result = await resetLabels(watchlistItems, depsKeep)

      // Should find orphaned entry but not modify it
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)

      // Should NOT remove labels in keep mode
      expect(mockPlexServer.removeSpecificLabels).not.toHaveBeenCalled()
      expect(mockDb.cleanupUserContentTracking).not.toHaveBeenCalled()
    })

    it('should apply removed label in special-label mode', async () => {
      const depsSpecial = {
        ...baseDeps,
        removedLabelMode: 'special-label' as const,
      }

      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt9999999'], // Orphaned
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '67890',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)
      vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)

      const result = await resetLabels(watchlistItems, depsSpecial)

      // Should find and process orphaned entry
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)

      // Should apply removed label
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('67890', [
        'pulsarr:removed',
      ])

      // Should cleanup old tracking
      expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
        ['imdb:tt9999999'],
        'movie',
        1,
      )

      // Should create new system tracking
      expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
        ['imdb:tt9999999'],
        'movie',
        null,
        '67890',
        ['pulsarr:removed'],
      )
    })

    it.skip('should handle GUID matching with weighted scores', async () => {
      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161', 'tmdb:278'], // Multiple GUIDs
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt0111161'], // Partial match
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)

      const result = await resetLabels(watchlistItems, baseDeps)

      // Should match based on overlapping GUID
      expect(result.processed).toBe(0) // Matches, so not orphaned
      expect(result.updated).toBe(0)
    })

    it.skip('should handle rating key fallback matching', async () => {
      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: '12345', // Rating key
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['12345'], // Only has rating key
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '12345',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)

      const result = await resetLabels(watchlistItems, baseDeps)

      // Tracking entry is found as orphaned and processed
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
    })

    it('should handle errors during orphaned cleanup', async () => {
      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt9999999'], // Orphaned
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '67890',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)
      vi.mocked(mockPlexServer.removeSpecificLabels).mockRejectedValue(
        new Error('Plex error'),
      )

      const result = await resetLabels(watchlistItems, baseDeps)

      // Should handle error gracefully
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.failed).toBe(1)
    })

    it('should emit progress events during reset', async () => {
      const mockProgress = {
        hasActiveConnections: vi.fn().mockReturnValue(true),
        emit: vi.fn(),
      }

      const depsWithProgress = {
        ...baseDeps,
        fastify: { progress: mockProgress } as unknown as FastifyInstance,
      }

      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Current Movie',
          type: 'movie',
          key: 'key-1',
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue([])

      await resetLabels(watchlistItems, depsWithProgress)

      // Verify progress events
      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'plex-label-sync',
          phase: 'start',
        }),
      )

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'plex-label-sync',
          phase: 'complete',
        }),
      )
    })

    it('should handle different content types (movies and shows)', async () => {
      const watchlistItems = [
        {
          id: 1,
          user_id: 1,
          guids: ['imdb:tt0111161'],
          title: 'Movie',
          type: 'movie',
          key: 'key-1',
        },
        {
          id: 2,
          user_id: 1,
          guids: ['tvdb:12345'],
          title: 'Show',
          type: 'show',
          key: 'key-2',
        },
      ]

      const allTracking: PlexLabelTracking[] = [
        {
          id: 1,
          content_guids: ['imdb:tt9999999'],
          content_type: 'movie',
          user_id: 1,
          plex_rating_key: '11111',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['tvdb:99999'],
          content_type: 'show',
          user_id: 1,
          plex_rating_key: '22222',
          labels_applied: ['pulsarr:alice'],
          synced_at: new Date().toISOString(),
        },
      ]

      vi.mocked(mockDb.getAllTrackedLabels).mockResolvedValue(allTracking)
      vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(true)
      vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

      const result = await resetLabels(watchlistItems, baseDeps)

      // Should find both orphaned entries
      expect(result.processed).toBe(2)
      expect(result.updated).toBe(2)

      // Verify cleanup for both content types
      expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
        ['imdb:tt9999999'],
        'movie',
        1,
      )
      expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
        ['tvdb:99999'],
        'show',
        1,
      )
    })
  })
})
