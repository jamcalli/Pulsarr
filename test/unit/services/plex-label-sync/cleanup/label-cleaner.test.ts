/**
 * Unit tests for label-cleaner module
 *
 * Tests cleanup of labels for deleted watchlist items and orphaned labels
 * with proper mode handling (remove/keep/special-label).
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PlexLabelTracking } from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  cleanupLabelsForWatchlistItems,
  cleanupOrphanedPlexLabels,
  type LabelCleanerDeps,
} from '@services/plex-label-sync/cleanup/label-cleaner.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { RadarrService } from '@services/radarr.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('label-cleaner', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockPlexServer: PlexServerService
  let mockDb: DatabaseService
  let mockRadarrManager: RadarrManagerService
  let mockSonarrManager: SonarrManagerService
  let mockFastify: FastifyInstance
  let baseDeps: LabelCleanerDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
      updateLabels: vi.fn(),
      removeSpecificLabels: vi.fn(),
      getCurrentLabels: vi.fn(),
    } as unknown as PlexServerService

    mockDb = {
      getWatchlistItemById: vi.fn(),
      getTrackedLabelsForContent: vi.fn(),
      cleanupUserContentTracking: vi.fn(),
      trackPlexLabels: vi.fn(),
      getAllUsers: vi.fn(),
      getOrphanedLabelTracking: vi.fn(),
      removeOrphanedTrackingBulk: vi.fn(),
    } as unknown as DatabaseService

    mockRadarrManager = {
      getAllInstances: vi.fn(),
      getRadarrService: vi.fn(),
    } as unknown as RadarrManagerService

    mockSonarrManager = {
      getAllInstances: vi.fn(),
      getSonarrService: vi.fn(),
    } as unknown as SonarrManagerService

    mockFastify = {} as unknown as FastifyInstance

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
      radarrManager: mockRadarrManager,
      sonarrManager: mockSonarrManager,
      fastify: mockFastify,
      labelPrefix: 'pulsarr',
      removedLabelPrefix: 'pulsarr:removed',
      removedLabelMode: 'remove',
      tagPrefix: 'pulsarr:user',
      removedTagPrefix: 'pulsarr:removed',
    }
  })

  describe('cleanupLabelsForWatchlistItems', () => {
    describe('Mode: keep', () => {
      it('should skip cleanup when mode is "keep"', async () => {
        const depsKeep = { ...baseDeps, removedLabelMode: 'keep' as const }

        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        await cleanupLabelsForWatchlistItems(watchlistItems, depsKeep)

        // Should not call any Plex or DB cleanup methods
        expect(mockPlexServer.removeSpecificLabels).not.toHaveBeenCalled()
        expect(mockDb.cleanupUserContentTracking).not.toHaveBeenCalled()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ itemCount: 1 }),
          expect.stringContaining('keep'),
        )
      })

      it('should handle empty watchlist items in keep mode', async () => {
        const depsKeep = { ...baseDeps, removedLabelMode: 'keep' as const }

        await cleanupLabelsForWatchlistItems([], depsKeep)

        expect(mockPlexServer.removeSpecificLabels).not.toHaveBeenCalled()
        expect(mockDb.cleanupUserContentTracking).not.toHaveBeenCalled()
      })
    })

    describe('Mode: remove', () => {
      it('should remove labels and cleanup tracking in remove mode', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161', 'tmdb:12345'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161', 'tmdb:12345'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        const mockTracking: PlexLabelTracking[] = [
          {
            id: 1,
            content_guids: ['imdb:tt0111161', 'tmdb:12345'],
            content_type: 'movie',
            user_id: 1,
            plex_rating_key: '12345',
            labels_applied: ['pulsarr:alice'],
            synced_at: new Date().toISOString(),
          },
        ]

        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue(
          mockTracking,
        )
        vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(true)
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        expect(mockPlexServer.removeSpecificLabels).toHaveBeenCalledWith(
          '12345',
          ['pulsarr:alice'],
        )
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
          ['imdb:tt0111161', 'tmdb:12345'],
          'movie',
          1,
        )
      })

      it('should handle multiple items with different rating keys', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie 1',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
          {
            id: 2,
            title: 'Test Movie 2',
            key: 'test-key-2',
            user_id: 1,
            guids: ['imdb:tt0222222'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById)
          .mockResolvedValueOnce({
            user_id: 1,
            guids: ['imdb:tt0111161'],
            type: 'movie',
            title: 'Test Movie 1',
            key: 'test-key-1',
            status: 'grabbed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .mockResolvedValueOnce({
            user_id: 1,
            guids: ['imdb:tt0222222'],
            type: 'movie',
            title: 'Test Movie 2',
            key: 'test-key-2',
            status: 'grabbed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

        vi.mocked(mockDb.getTrackedLabelsForContent)
          .mockResolvedValueOnce([
            {
              id: 1,
              content_guids: ['imdb:tt0111161'],
              content_type: 'movie',
              user_id: 1,
              plex_rating_key: '12345',
              labels_applied: ['pulsarr:alice'],
              synced_at: new Date().toISOString(),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 2,
              content_guids: ['imdb:tt0222222'],
              content_type: 'movie',
              user_id: 1,
              plex_rating_key: '67890',
              labels_applied: ['pulsarr:alice'],
              synced_at: new Date().toISOString(),
            },
          ])

        vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(true)
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        expect(mockPlexServer.removeSpecificLabels).toHaveBeenCalledTimes(2)
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledTimes(2)
      })

      it('should handle empty tracked labels gracefully', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue([])
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        // Should not call removeSpecificLabels since no tracked labels
        expect(mockPlexServer.removeSpecificLabels).not.toHaveBeenCalled()
        // But should still cleanup tracking
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
          ['imdb:tt0111161'],
          'movie',
          1,
        )
      })

      it('should handle removal failures gracefully', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue([
          {
            id: 1,
            content_guids: ['imdb:tt0111161'],
            content_type: 'movie',
            user_id: 1,
            plex_rating_key: '12345',
            labels_applied: ['pulsarr:alice'],
            synced_at: new Date().toISOString(),
          },
        ])

        vi.mocked(mockPlexServer.removeSpecificLabels).mockResolvedValue(false)
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ ratingKey: '12345' }),
          expect.stringContaining('Failed to remove labels'),
        )
        // Should still cleanup tracking even on Plex failure
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalled()
      })

      it('should skip items with no watchlist data', async () => {
        const watchlistItems = [
          {
            id: 999,
            title: 'Missing Movie',
            key: 'test-key-missing',
            user_id: 1,
            guids: ['imdb:tt0999999'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue(undefined)

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        expect(mockDb.getTrackedLabelsForContent).not.toHaveBeenCalled()
        expect(mockPlexServer.removeSpecificLabels).not.toHaveBeenCalled()
      })

      it('should skip items with no GUIDs', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: [],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: [],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        await cleanupLabelsForWatchlistItems(watchlistItems, baseDeps)

        expect(mockDb.getTrackedLabelsForContent).not.toHaveBeenCalled()
      })
    })

    describe('Mode: special-label', () => {
      it('should apply removed label when last user removes content', async () => {
        const depsSpecial = {
          ...baseDeps,
          removedLabelMode: 'special-label' as const,
        }

        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getAllUsers).mockResolvedValue([
          {
            id: 1,
            name: 'alice',
            can_sync: true,
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            apprise: null,
            alias: null,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Only this user has the content
        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue([
          {
            id: 1,
            content_guids: ['imdb:tt0111161'],
            content_type: 'movie',
            user_id: 1,
            plex_rating_key: '12345',
            labels_applied: ['pulsarr:alice'],
            synced_at: new Date().toISOString(),
          },
        ])

        vi.mocked(mockPlexServer.getCurrentLabels).mockResolvedValue([
          'pulsarr:alice',
        ])
        vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
        vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, depsSpecial)

        // Should apply removed label
        expect(mockPlexServer.updateLabels).toHaveBeenCalledWith(
          '12345',
          expect.arrayContaining(['pulsarr:removed']),
        )

        // Should track removed label with user_id = null
        expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
          ['imdb:tt0111161'],
          'movie',
          null,
          '12345',
          ['pulsarr:removed'],
        )

        // Should cleanup user tracking
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalledWith(
          ['imdb:tt0111161'],
          'movie',
          1,
        )
      })

      it('should remove only specific user label when other users remain', async () => {
        const depsSpecial = {
          ...baseDeps,
          removedLabelMode: 'special-label' as const,
        }

        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getAllUsers).mockResolvedValue([
          {
            id: 1,
            name: 'alice',
            can_sync: true,
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            apprise: null,
            alias: null,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 2,
            name: 'bob',
            can_sync: true,
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            apprise: null,
            alias: null,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])

        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Both users have the content
        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue([
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
            plex_rating_key: '12345',
            labels_applied: ['pulsarr:bob'],
            synced_at: new Date().toISOString(),
          },
        ])

        vi.mocked(mockPlexServer.getCurrentLabels).mockResolvedValue([
          'pulsarr:alice',
          'pulsarr:bob',
          'other-label',
        ])
        vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, depsSpecial)

        // Should remove only alice's label, keep bob's
        expect(mockPlexServer.updateLabels).toHaveBeenCalledWith(
          '12345',
          expect.arrayContaining(['pulsarr:bob', 'other-label']),
        )

        // Should NOT include alice's label or removed label
        const updateCall = vi.mocked(mockPlexServer.updateLabels).mock.calls[0]
        expect(updateCall[1]).not.toContain('pulsarr:alice')
        expect(updateCall[1]).not.toContain('pulsarr:removed')

        // Should NOT track removed label since other users remain
        expect(mockDb.trackPlexLabels).not.toHaveBeenCalled()
      })

      it('should handle empty tracking in special-label mode', async () => {
        const depsSpecial = {
          ...baseDeps,
          removedLabelMode: 'special-label' as const,
        }

        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getAllUsers).mockResolvedValue([])
        vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
          user_id: 1,
          guids: ['imdb:tt0111161'],
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-1',
          status: 'grabbed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        vi.mocked(mockDb.getTrackedLabelsForContent).mockResolvedValue([])
        vi.mocked(mockDb.cleanupUserContentTracking).mockResolvedValue(1)

        await cleanupLabelsForWatchlistItems(watchlistItems, depsSpecial)

        expect(mockPlexServer.updateLabels).not.toHaveBeenCalled()
        expect(mockDb.cleanupUserContentTracking).toHaveBeenCalled()
      })
    })

    describe('Error handling', () => {
      it('should not throw on general errors', async () => {
        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        vi.mocked(mockDb.getWatchlistItemById).mockRejectedValue(
          new Error('Database error'),
        )

        await expect(
          cleanupLabelsForWatchlistItems(watchlistItems, baseDeps),
        ).resolves.not.toThrow()

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.stringContaining('Error during label cleanup'),
        )
      })

      it('should handle disabled config', async () => {
        const disabledDeps = {
          ...baseDeps,
          config: { ...baseDeps.config, enabled: false },
        }

        const watchlistItems = [
          {
            id: 1,
            title: 'Test Movie',
            key: 'test-key-1',
            user_id: 1,
            guids: ['imdb:tt0111161'],
            contentType: 'movie' as const,
          },
        ]

        await cleanupLabelsForWatchlistItems(watchlistItems, disabledDeps)

        expect(mockDb.getWatchlistItemById).not.toHaveBeenCalled()
      })

      it('should handle empty watchlist items array', async () => {
        await cleanupLabelsForWatchlistItems([], baseDeps)

        expect(mockDb.getWatchlistItemById).not.toHaveBeenCalled()
      })
    })
  })

  describe('cleanupOrphanedPlexLabels', () => {
    it('should skip when config disabled', async () => {
      const disabledDeps = {
        ...baseDeps,
        config: { ...baseDeps.config, enabled: false },
      }

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        disabledDeps,
      )

      expect(result).toEqual({ removed: 0, failed: 0 })
      expect(mockDb.getAllUsers).not.toHaveBeenCalled()
    })

    it('should skip when orphaned cleanup disabled', async () => {
      const disabledDeps = {
        ...baseDeps,
        config: { ...baseDeps.config, cleanupOrphanedLabels: false },
      }

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        disabledDeps,
      )

      expect(result).toEqual({ removed: 0, failed: 0 })
      expect(mockDb.getAllUsers).not.toHaveBeenCalled()
    })

    it('should skip when no sync-enabled users', async () => {
      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: false, // Not sync enabled
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result).toEqual({ removed: 0, failed: 0 })
      expect(mockDb.getOrphanedLabelTracking).not.toHaveBeenCalled()
    })

    it('should skip when no orphaned labels found', async () => {
      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([])

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result).toEqual({ removed: 0, failed: 0 })
      expect(mockPlexServer.getMetadata).not.toHaveBeenCalled()
    })

    it('should remove orphaned labels successfully', async () => {
      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([
        {
          plex_rating_key: '12345',
          orphaned_labels: ['pulsarr:bob'], // Bob is no longer a sync user
        },
      ])

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/123',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:alice' }, { tag: 'pulsarr:bob' }],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.removeOrphanedTrackingBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 1,
      })

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result.removed).toBe(1)
      expect(result.failed).toBe(0)

      // Should update labels without bob
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:alice',
      ])

      // Should cleanup tracking
      expect(mockDb.removeOrphanedTrackingBulk).toHaveBeenCalledWith([
        {
          plexRatingKey: '12345',
          orphanedLabels: ['pulsarr:bob'],
        },
      ])
    })

    it('should use pre-fetched tag data when provided', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: true,
          },
        },
      }

      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      const radarrMoviesWithTags = [
        {
          instanceId: 1,
          movie: { id: 1, title: 'Test Movie', tmdbId: 12345 },
          tags: ['action', 'hd'],
          instanceName: 'radarr-main',
        },
      ]

      const sonarrSeriesWithTags = [
        {
          instanceId: 1,
          series: { id: 1, title: 'Test Show', tvdbId: 67890 },
          tags: ['drama'],
          instanceName: 'sonarr-main',
        },
      ]

      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([])

      await cleanupOrphanedPlexLabels(
        radarrMoviesWithTags,
        sonarrSeriesWithTags,
        depsWithTagSync,
      )

      // Should not call radarrManager or sonarrManager since tags are pre-fetched
      expect(mockRadarrManager.getAllInstances).not.toHaveBeenCalled()
      expect(mockSonarrManager.getAllInstances).not.toHaveBeenCalled()
    })

    it('should fetch fresh tag data when not provided', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: true,
          },
        },
      }

      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      vi.mocked(mockRadarrManager.getAllInstances).mockResolvedValue([
        {
          id: 1,
          name: 'radarr-main',
          baseUrl: 'http://localhost:7878',
          apiKey: 'test-key',
          qualityProfile: null,
          rootFolder: null,
          bypassIgnored: false,
          tags: [],
          isDefault: true,
        },
      ])

      const mockRadarrService = {
        getTags: vi.fn().mockResolvedValue([
          { id: 1, label: 'action' },
          { id: 2, label: 'hd' },
        ]),
      } as unknown as RadarrService

      vi.mocked(mockRadarrManager.getRadarrService).mockReturnValue(
        mockRadarrService,
      )

      vi.mocked(mockSonarrManager.getAllInstances).mockResolvedValue([])
      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([])

      await cleanupOrphanedPlexLabels(undefined, undefined, depsWithTagSync)

      expect(mockRadarrManager.getAllInstances).toHaveBeenCalled()
      expect(mockRadarrManager.getRadarrService).toHaveBeenCalledWith(1)
      expect(mockRadarrService.getTags).toHaveBeenCalled()
    })

    it('should handle Plex update failures', async () => {
      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([
        {
          plex_rating_key: '12345',
          orphaned_labels: ['pulsarr:bob'],
        },
      ])

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/123',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:bob' }],
      })

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(false)

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result.removed).toBe(0)
      expect(result.failed).toBe(1)
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(mockDb.getAllUsers).mockRejectedValue(
        new Error('Database error'),
      )

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result).toEqual({ removed: 0, failed: 1 })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Error during orphaned label cleanup'),
      )
    })

    it('should handle content with no labels', async () => {
      vi.mocked(mockDb.getAllUsers).mockResolvedValue([
        {
          id: 1,
          name: 'alice',
          can_sync: true,
          discord_id: null,
          notify_discord: false,
          notify_apprise: false,
          apprise: null,
          alias: null,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      vi.mocked(mockDb.getOrphanedLabelTracking).mockResolvedValue([
        {
          plex_rating_key: '12345',
          orphaned_labels: ['pulsarr:bob'],
        },
      ])

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/123',
        type: 'movie',
        title: 'Test Movie',
        Label: [], // No labels
      })

      vi.mocked(mockDb.removeOrphanedTrackingBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
        totalUpdatedCount: 1,
      })

      const result = await cleanupOrphanedPlexLabels(
        undefined,
        undefined,
        baseDeps,
      )

      expect(result.removed).toBe(0)
      expect(result.failed).toBe(0)

      // Should not call updateLabels since no labels to update
      expect(mockPlexServer.updateLabels).not.toHaveBeenCalled()

      // But should cleanup tracking
      expect(mockDb.removeOrphanedTrackingBulk).toHaveBeenCalled()
    })
  })
})
