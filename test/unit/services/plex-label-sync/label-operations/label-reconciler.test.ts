import type { ContentWithUsers } from '@root/types/plex-label-sync.types.js'
import type { PlexMetadata } from '@root/types/plex-server.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type LabelReconcilerDeps,
  reconcileLabelsForSingleItem,
} from '@services/plex-label-sync/label-operations/label-reconciler.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Helper to create minimal PlexMetadata objects for testing
function createMockPlexMetadata(labels: string[]): PlexMetadata {
  return {
    ratingKey: '123',
    key: '/library/metadata/123',
    guid: 'plex://movie/123',
    type: 'movie',
    title: 'Test Movie',
    Label: labels.map((tag) => ({ tag })),
  }
}

describe('label-reconciler', () => {
  let mockPlexServer: PlexServerService
  let mockDb: DatabaseService
  let mockLogger: ReturnType<typeof createMockLogger>
  let baseDeps: LabelReconcilerDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
      updateLabels: vi.fn(),
    } as unknown as PlexServerService

    mockDb = {} as DatabaseService

    baseDeps = {
      plexServer: mockPlexServer,
      db: mockDb,
      logger: mockLogger,
      config: {
        labelPrefix: 'pulsarr',
        tagSync: {
          enabled: false,
        },
      } as PlexLabelSyncConfig,
      removedLabelMode: 'remove',
      removedLabelPrefix: 'pulsarr:removed',
      tagPrefix: 'pulsarr:user',
      removedTagPrefix: 'pulsarr:removed',
    }
  })

  describe('reconcileLabelsForSingleItem - remove mode (default)', () => {
    beforeEach(() => {
      baseDeps.removedLabelMode = 'remove'
    })

    it('should remove obsolete user labels when users are removed', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [
          { user_id: 1, username: 'alice', watchlist_id: 1 },
          // bob was removed
        ],
      }

      // Current labels: alice and bob
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'pulsarr:bob', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'], // Only alice remains
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
      expect(result.labelsRemoved).toBe(1) // bob was removed
    })

    it('should add new user labels while preserving existing ones', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [
          { user_id: 1, username: 'alice', watchlist_id: 1 },
          { user_id: 2, username: 'bob', watchlist_id: 2 },
        ],
      }

      // Current labels: only alice
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice', 'pulsarr:bob'],
        ['pulsarr:alice', 'pulsarr:bob'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
        'pulsarr:bob',
      ])
      expect(result.labelsAdded).toBe(1) // bob was added
    })

    it('should preserve non-app labels during reconciliation', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'manual-label', '4K', 'HDR']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'manual-label',
        '4K',
        'HDR',
        'pulsarr:alice',
      ])
      expect(result.labelsAdded).toBe(0)
      expect(result.labelsRemoved).toBe(0)
    })

    it('should handle empty current labels', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
      expect(result.labelsAdded).toBe(1)
    })

    it('should handle empty desired labels', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        [], // No desired labels
        [],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
      ])
      expect(result.labelsRemoved).toBe(1) // alice was removed
    })

    it('should handle duplicate labels in current state', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:alice',
          'pulsarr:alice',
          'other-label',
        ]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Duplicates should be handled by Set deduplication
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
    })

    it('should clean up removed labels when users re-add content', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:removed', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
      // Removed label should be cleaned up
      const updateCall = vi.mocked(mockPlexServer.updateLabels).mock.calls[0][1]
      expect(updateCall).not.toContain('pulsarr:removed')
    })
  })

  describe('reconcileLabelsForSingleItem - keep mode', () => {
    beforeEach(() => {
      baseDeps.removedLabelMode = 'keep'
    })

    it('should preserve all existing labels when adding new ones', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [
          { user_id: 1, username: 'alice', watchlist_id: 1 },
          { user_id: 2, username: 'bob', watchlist_id: 2 },
        ],
      }

      // Current: alice and charlie (charlie was removed from desired)
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:alice',
          'pulsarr:charlie',
          'other-label',
        ]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice', 'pulsarr:bob'], // charlie not in desired
        ['pulsarr:alice', 'pulsarr:bob'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Should keep charlie even though not in desired
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:charlie',
        'other-label',
        'pulsarr:bob',
      ])
      expect(result.labelsAdded).toBe(1) // bob added
      expect(result.labelsRemoved).toBe(0) // charlie NOT removed
    })

    it('should accumulate labels over time in keep mode', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 3, username: 'dave', watchlist_id: 3 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:alice',
          'pulsarr:bob',
          'pulsarr:charlie',
        ]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:dave'],
        ['pulsarr:dave'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // All previous labels preserved + dave added
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:bob',
        'pulsarr:charlie',
        'pulsarr:dave',
      ])
      expect(result.labelsAdded).toBe(1)
      expect(result.labelsRemoved).toBe(0)
    })

    it('should not add duplicate labels in keep mode', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'other-label',
      ])
      expect(result.labelsAdded).toBe(0)
      expect(result.labelsRemoved).toBe(0)
    })
  })

  describe('reconcileLabelsForSingleItem - special-label mode', () => {
    beforeEach(() => {
      baseDeps.removedLabelMode = 'special-label'
    })

    it('should add removed label when no user labels exist', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [], // No users
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        [], // No desired labels
        [], // No user labels
        [], // No tag labels
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:removed',
      ])
      expect(result.specialRemovedLabel).toBe('pulsarr:removed')
    })

    it('should remove special removed label when users re-add content', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:removed', 'other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
      // Removed label should be cleaned up
      const updateCall = vi.mocked(mockPlexServer.updateLabels).mock.calls[0][1]
      expect(updateCall).not.toContain('pulsarr:removed')
      expect(result.specialRemovedLabel).toBeUndefined()
    })

    it('should not add removed label when tag labels exist but user labels do not', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [], // No users
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:action', 'pulsarr:hdr'], // Tag labels only
        [], // No user labels
        ['pulsarr:action', 'pulsarr:hdr'], // Tag labels
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Should add removed label since NO user labels exist
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:removed',
      ])
      expect(result.specialRemovedLabel).toBe('pulsarr:removed')
    })

    it('should preserve existing app labels when applying special removed label', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:alice',
          'pulsarr:bob',
          'manual-label',
          'pulsarr:removed:old',
        ]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        [],
        [],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Should remove app labels but preserve non-app labels, and replace old removed label
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'manual-label',
        'pulsarr:removed',
      ])
      expect(result.specialRemovedLabel).toBe('pulsarr:removed')
    })
  })

  describe('reconcileLabelsForSingleItem - user + tag label combinations', () => {
    it('should apply both user labels and tag labels', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [
          { user_id: 1, username: 'alice', watchlist_id: 1 },
          { user_id: 2, username: 'bob', watchlist_id: 2 },
        ],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice', 'pulsarr:bob', 'pulsarr:action', 'pulsarr:hdr'],
        ['pulsarr:alice', 'pulsarr:bob'],
        ['pulsarr:action', 'pulsarr:hdr'],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
        'pulsarr:bob',
        'pulsarr:action',
        'pulsarr:hdr',
      ])
      expect(result.labelsAdded).toBe(4)
    })

    it('should combine user labels and tag labels in single update', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice', 'pulsarr:action'],
        ['pulsarr:alice'],
        ['pulsarr:action'],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Should be single API call with both labels
      expect(mockPlexServer.updateLabels).toHaveBeenCalledTimes(1)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:action',
      ])
    })

    it('should remove obsolete tag labels when tags change', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:alice', 'pulsarr:old-tag']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice', 'pulsarr:new-tag'],
        ['pulsarr:alice'],
        ['pulsarr:new-tag'],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:new-tag',
      ])
      expect(result.labelsAdded).toBe(1) // new-tag added
      expect(result.labelsRemoved).toBe(1) // old-tag removed
    })
  })

  describe('reconcileLabelsForSingleItem - error handling', () => {
    it('should return failure when getMetadata throws error', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockRejectedValue(
        new Error('Network error'),
      )

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          ratingKey: '123',
          contentTitle: 'The Shawshank Redemption',
          error: expect.any(Error),
        }),
        'Error reconciling labels for Plex item',
      )
    })

    it('should return failure when updateLabels returns false', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(false)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to update labels in Plex')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          ratingKey: '123',
          contentTitle: 'The Shawshank Redemption',
        }),
        'Failed to update labels for Plex item',
      )
    })

    it('should handle null metadata gracefully', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(null)

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:alice'],
        ['pulsarr:alice'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      // Should treat as empty current labels
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
    })
  })

  describe('reconcileLabelsForSingleItem - edge cases', () => {
    it('should handle case-insensitive label comparison', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [{ user_id: 1, username: 'alice', watchlist_id: 1 }],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['PULSARR:ALICE']),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:user-name_123'],
        ['pulsarr:user-name_123'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:user-name_123',
      ])
    })

    it('should handle very long label names', async () => {
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users: [
          {
            user_id: 1,
            username:
              'very-long-username-that-exceeds-normal-limits-for-testing',
            watchlist_id: 1,
          },
        ],
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await reconcileLabelsForSingleItem(
        '123',
        ['pulsarr:very-long-username-that-exceeds-normal-limits-for-testing'],
        ['pulsarr:very-long-username-that-exceeds-normal-limits-for-testing'],
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:very-long-username-that-exceeds-normal-limits-for-testing',
      ])
    })

    it('should handle many users with many labels', async () => {
      const users = Array.from({ length: 20 }, (_, i) => ({
        user_id: i + 1,
        username: `user${i + 1}`,
        watchlist_id: i + 1,
      }))

      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0111161',
        allGuids: ['imdb:tt0111161'],
        title: 'The Shawshank Redemption',
        type: 'movie',
        plexKey: null,
        users,
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )

      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const desiredLabels = users.map((u) => `pulsarr:${u.username}`)

      const result = await reconcileLabelsForSingleItem(
        '123',
        desiredLabels,
        desiredLabels,
        [],
        content,
        baseDeps,
      )

      expect(result.success).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith(
        '123',
        desiredLabels,
      )
      expect(result.labelsAdded).toBe(20)
    })
  })
})
