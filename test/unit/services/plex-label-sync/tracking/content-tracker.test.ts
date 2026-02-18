/**
 * Unit tests for content-tracker module
 *
 * Tests tracking table updates for label reconciliation with proper handling
 * of user labels, tag labels, removed labels, and orphaned records.
 */

import type { ContentWithUsers } from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PlexLabelTracking } from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type ContentTrackerDeps,
  updateTrackingForContent,
} from '@services/plex-label-sync/tracking/content-tracker.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

/**
 * Helper to create mock ContentWithUsers
 */
function createMockContent(
  users: Array<{ user_id: number; username: string; watchlist_id: number }>,
): ContentWithUsers {
  return {
    primaryGuid: 'imdb:tt0111161',
    allGuids: ['imdb:tt0111161', 'tmdb:278'],
    title: 'The Shawshank Redemption',
    type: 'movie',
    plexKey: '5d776825880197001ec90e47',
    users,
  }
}

/**
 * Helper to create mock tracking record
 */
function createMockTracking(
  userId: number | null,
  ratingKey: string,
  labels: string[],
): PlexLabelTracking {
  return {
    id: 1,
    content_guids: ['imdb:tt0111161', 'tmdb:278'],
    content_type: 'movie',
    user_id: userId,
    plex_rating_key: ratingKey,
    labels_applied: labels,
    synced_at: new Date().toISOString(),
  }
}

describe('content-tracker', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockDb: DatabaseService
  let baseDeps: ContentTrackerDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getTrackedLabelsForRatingKey: vi.fn(),
      untrackPlexLabelBulk: vi.fn(),
      trackPlexLabelsBulk: vi.fn(),
    } as unknown as DatabaseService

    const config: PlexLabelSyncConfig = {
      enabled: true,
      labelPrefix: 'pulsarr',
      concurrencyLimit: 5,
      cleanupOrphanedLabels: false,
      removedLabelMode: 'keep',
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
      db: mockDb,
      logger: mockLogger,
      config,
    }
  })

  describe('User label tracking', () => {
    it('should track new user labels', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
        { user_id: 2, username: 'bob', watchlist_id: 102 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice', 'pulsarr:bob']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 2,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 1,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:alice'],
        },
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 2,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:bob'],
        },
      ])
    })

    it('should untrack removed user labels', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      // Bob's label exists but should be removed
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(1, '12345', ['pulsarr:alice']),
        createMockTracking(2, '12345', ['pulsarr:bob']),
      ])
      vi.mocked(mockDb.untrackPlexLabelBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.untrackPlexLabelBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          userId: 2,
          plexRatingKey: '12345',
          labelApplied: 'pulsarr:bob',
        },
      ])
    })

    it('should handle multiple users on same content', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
        { user_id: 2, username: 'bob', watchlist_id: 102 },
        { user_id: 3, username: 'charlie', watchlist_id: 103 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = [
        'pulsarr:alice',
        'pulsarr:bob',
        'pulsarr:charlie',
      ]
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 3,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 1,
            labelsApplied: ['pulsarr:alice'],
          }),
          expect.objectContaining({
            userId: 2,
            labelsApplied: ['pulsarr:bob'],
          }),
          expect.objectContaining({
            userId: 3,
            labelsApplied: ['pulsarr:charlie'],
          }),
        ]),
      )
    })
  })

  describe('Tag label tracking', () => {
    it('should track tag labels for each user', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
        { user_id: 2, username: 'bob', watchlist_id: 102 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice', 'pulsarr:bob']
      const finalTagLabels = ['pulsarr:action', 'pulsarr:hd']
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 2,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        [...finalUserLabels, ...finalTagLabels],
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 1,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:alice', 'pulsarr:action', 'pulsarr:hd'],
        },
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 2,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:bob', 'pulsarr:action', 'pulsarr:hd'],
        },
      ])
    })

    it('should track tag labels without user labels', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels: string[] = [] // No user labels
      const finalTagLabels = ['pulsarr:action']
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalTagLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 1,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:action'],
        },
      ])
    })

    it('should remove obsolete tag labels', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels = ['pulsarr:action'] // hd tag removed
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(1, '12345', [
          'pulsarr:alice',
          'pulsarr:action',
          'pulsarr:hd',
        ]),
      ])
      vi.mocked(mockDb.untrackPlexLabelBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        [...finalUserLabels, ...finalTagLabels],
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.untrackPlexLabelBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          userId: 1,
          plexRatingKey: '12345',
          labelApplied: 'pulsarr:hd',
        },
      ])
    })
  })

  describe('Removed label tracking', () => {
    it('should track removed labels with userId null', async () => {
      const content = createMockContent([])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels: string[] = []
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>([
        ['12345', 'pulsarr:removed'],
      ])

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: null,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:removed'],
        },
      ])
    })

    it('should remove removed labels when users re-add content', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      // Removed label exists in tracking
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(null, '12345', ['pulsarr:removed']),
      ])
      vi.mocked(mockDb.untrackPlexLabelBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.untrackPlexLabelBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          userId: null,
          plexRatingKey: '12345',
          labelApplied: 'pulsarr:removed',
        },
      ])
    })

    it('should not confuse system records with user records', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>([
        ['12345', 'pulsarr:removed'],
      ])

      // User label and system removed label coexist
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(1, '12345', ['pulsarr:alice']),
        createMockTracking(null, '12345', ['pulsarr:removed']),
      ])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 2,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      // Both should be tracked (user label + removed label)
      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: 1 }),
          expect.objectContaining({ userId: null }),
        ]),
      )
    })
  })

  describe('Orphaned user handling', () => {
    it('should untrack orphaned user records', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      // User 999 no longer exists in content.users
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(1, '12345', ['pulsarr:alice']),
        createMockTracking(999, '12345', ['pulsarr:orphaned']),
      ])
      vi.mocked(mockDb.untrackPlexLabelBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.untrackPlexLabelBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          userId: 999,
          plexRatingKey: '12345',
          labelApplied: 'pulsarr:orphaned',
        },
      ])
    })
  })

  describe('Validation', () => {
    it('should skip tracking for invalid watchlist_id', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 0 }, // Invalid
        { user_id: 2, username: 'bob', watchlist_id: 102 }, // Valid
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice', 'pulsarr:bob']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      // Only bob's label should be tracked
      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 2,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:bob'],
        },
      ])
    })

    it('should not track when no labels to apply', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels: string[] = [] // No user labels
      const finalTagLabels: string[] = [] // No tag labels
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).not.toHaveBeenCalled()
    })
  })

  describe('Multiple Plex items', () => {
    it('should handle multiple Plex items for same content', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [
        { ratingKey: '12345', title: 'Movie Part 1' },
        { ratingKey: '67890', title: 'Movie Part 2' },
      ]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 2,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 1,
          plexRatingKey: '12345',
          labelsApplied: ['pulsarr:alice'],
        },
        {
          contentGuids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie',
          userId: 1,
          plexRatingKey: '67890',
          labelsApplied: ['pulsarr:alice'],
        },
      ])
    })
  })

  describe('Error handling', () => {
    it('should handle bulk untrack failures gracefully', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        createMockTracking(2, '12345', ['pulsarr:bob']),
      ])
      vi.mocked(mockDb.untrackPlexLabelBulk).mockRejectedValue(
        new Error('Database error'),
      )
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      // Should not throw
      await expect(
        updateTrackingForContent(
          content,
          plexItems,
          finalUserLabels,
          finalUserLabels,
          finalTagLabels,
          appliedRemovedLabels,
          baseDeps,
        ),
      ).resolves.toBeUndefined()
    })

    it('should handle bulk track failures gracefully', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockRejectedValue(
        new Error('Database error'),
      )

      // Should not throw
      await expect(
        updateTrackingForContent(
          content,
          plexItems,
          finalUserLabels,
          finalUserLabels,
          finalTagLabels,
          appliedRemovedLabels,
          baseDeps,
        ),
      ).resolves.toBeUndefined()
    })

    it('should handle complete function errors gracefully', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockRejectedValue(
        new Error('Critical database error'),
      )

      // Should not throw - errors are caught and logged
      await expect(
        updateTrackingForContent(
          content,
          plexItems,
          finalUserLabels,
          finalUserLabels,
          finalTagLabels,
          appliedRemovedLabels,
          baseDeps,
        ),
      ).resolves.toBeUndefined()
    })
  })

  describe('Edge cases', () => {
    it('should handle empty content users array', async () => {
      const content = createMockContent([])
      const plexItems = [{ ratingKey: '12345', title: 'Test Movie' }]
      const finalUserLabels: string[] = []
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).not.toHaveBeenCalled()
      expect(mockDb.untrackPlexLabelBulk).not.toHaveBeenCalled()
    })

    it('should handle empty plexItems array', async () => {
      const content = createMockContent([
        { user_id: 1, username: 'alice', watchlist_id: 101 },
      ])
      const plexItems: Array<{ ratingKey: string; title: string }> = []
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).not.toHaveBeenCalled()
      expect(mockDb.untrackPlexLabelBulk).not.toHaveBeenCalled()
    })

    it('should handle shows correctly', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'tvdb:121361',
        allGuids: ['tvdb:121361', 'tmdb:1396'],
        title: 'Breaking Bad',
        type: 'show',
        plexKey: '5d776825880197001ec90e48',
        users: [{ user_id: 1, username: 'alice', watchlist_id: 101 }],
      }
      const plexItems = [{ ratingKey: '12345', title: 'Breaking Bad' }]
      const finalUserLabels = ['pulsarr:alice']
      const finalTagLabels: string[] = []
      const appliedRemovedLabels = new Map<string, string>()

      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.trackPlexLabelsBulk).mockResolvedValue({
        processedCount: 1,
        failedIds: [],
      })

      await updateTrackingForContent(
        content,
        plexItems,
        finalUserLabels,
        finalUserLabels,
        finalTagLabels,
        appliedRemovedLabels,
        baseDeps,
      )

      expect(mockDb.trackPlexLabelsBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          contentType: 'show',
        }),
      ])
    })
  })
})
