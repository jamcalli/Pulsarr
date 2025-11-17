/**
 * Unit tests for label-applicator module
 *
 * Tests label application to single Plex items with webhook tag support
 * and proper mode handling (remove/keep/special-label).
 */

import type { PlexMetadata } from '@root/types/plex-server.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  applyLabelsToSingleItem,
  type LabelApplicatorDeps,
} from '@services/plex-label-sync/label-operations/label-applicator.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Helper to create minimal PlexMetadata with labels
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

describe('label-applicator', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockPlexServer: PlexServerService
  let mockDb: DatabaseService
  let baseDeps: LabelApplicatorDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
      updateLabels: vi.fn(),
    } as unknown as PlexServerService

    mockDb = {
      getTrackedLabelsForRatingKey: vi.fn(),
      getWatchlistItemById: vi.fn(),
      trackPlexLabels: vi.fn(),
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
      plexServer: mockPlexServer,
      db: mockDb,
      logger: mockLogger,
      config,
      removedLabelMode: 'remove',
      removedLabelPrefix: 'pulsarr:removed',
      tagPrefix: 'pulsarr:user',
      removedTagPrefix: 'pulsarr:removed',
    }
  })

  describe('Basic functionality', () => {
    it('should apply user labels only', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [
        { user_id: 1, username: 'alice', watchlist_id: 1 },
        { user_id: 2, username: 'bob', watchlist_id: 2 },
      ]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:bob',
      ])
    })

    it('should preserve non-app labels', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label', 'custom-tag']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'custom-tag',
        'pulsarr:alice',
      ])
    })

    it('should handle empty users array', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await applyLabelsToSingleItem('123', [], baseDeps)

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
      ])
    })

    it('should handle null metadata', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(null)
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
    })
  })

  describe('Webhook tag processing', () => {
    it('should apply webhook tags when tag sync enabled', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false,
          },
        },
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['action', 'thriller']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:action',
        'pulsarr:thriller',
      ])
    })

    it('should skip webhook tags when tag sync disabled', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['action', 'thriller']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        baseDeps,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      // Should NOT include webhook tags
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
    })

    it('should filter user tagging system tags from webhooks', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false,
          },
        },
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = [
        'action',
        'pulsarr:user:bob', // User tagging system tag
        'pulsarr:removed:old', // Removed tag
        'thriller',
      ]

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      // Should filter out user tagging system tags
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'pulsarr:action',
        'pulsarr:thriller',
      ])
    })

    it('should skip tags for movies when syncRadarrTags is false', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: false, // Disabled for movies
            syncSonarrTags: true,
          },
        },
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['action']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      // Should NOT include webhook tags for movies
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
    })

    it('should skip tags for shows when syncSonarrTags is false', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false, // Disabled for shows
          },
        },
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0903747'],
        type: 'show',
        title: 'Test Show',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['drama']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'show',
      )

      expect(result).toBe(true)
      // Should NOT include webhook tags for shows
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
      ])
    })
  })

  describe('Removed label cleanup', () => {
    it('should clean up removed labels when users re-add content', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'other-label',
          'pulsarr:removed',
          'pulsarr:removed:old',
        ]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      // Should remove "removed" labels
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
    })

    it('should not clean up removed labels in cleanup check when no users', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label', 'pulsarr:removed']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)

      const result = await applyLabelsToSingleItem('123', [], baseDeps)

      expect(result).toBe(true)
      // In remove mode, app labels (including removed labels) are filtered out
      // This is correct behavior - removed labels are app-managed and get cleaned in remove mode
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
      ])
    })
  })

  describe('Mode: remove', () => {
    it('should remove obsolete app labels in remove mode', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:bob',
          'pulsarr:charlie',
          'other-label',
        ]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      // Should remove bob and charlie, keep other-label, add alice
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
      ])
    })

    it('should remove obsolete tag labels in remove mode', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:oldtag', 'other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false,
          },
        },
      }

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['newtag']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      // Should remove oldtag, add newtag
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:alice',
        'pulsarr:newtag',
      ])
    })
  })

  describe('Mode: keep', () => {
    it('should preserve all tracked labels in keep mode', async () => {
      const depsKeep = { ...baseDeps, removedLabelMode: 'keep' as const }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:bob', 'other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 2,
          plex_rating_key: '123',
          labels_applied: ['pulsarr:bob', 'pulsarr:oldtag'],
          synced_at: new Date().toISOString(),
        },
      ])
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, depsKeep)

      expect(result).toBe(true)
      // Should keep all tracked labels (bob, oldtag) AND add alice
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith(
        '123',
        expect.arrayContaining([
          'pulsarr:bob',
          'pulsarr:oldtag',
          'pulsarr:alice',
          'other-label',
        ]),
      )
    })

    it('should handle empty tracked labels in keep mode', async () => {
      const depsKeep = { ...baseDeps, removedLabelMode: 'keep' as const }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([])
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, depsKeep)

      expect(result).toBe(true)
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'pulsarr:alice',
        'other-label',
      ])
    })
  })

  describe('Mode: special-label', () => {
    it('should preserve tracked app labels in special-label mode', async () => {
      const depsSpecial = {
        ...baseDeps,
        removedLabelMode: 'special-label' as const,
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['pulsarr:bob', 'other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 2,
          plex_rating_key: '123',
          labels_applied: ['pulsarr:bob'],
          synced_at: new Date().toISOString(),
        },
      ])
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, depsSpecial)

      expect(result).toBe(true)
      // Should keep tracked bob AND add alice
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:bob',
        'pulsarr:alice',
      ])
    })

    it('should remove existing removed labels in special-label mode when users exist', async () => {
      const depsSpecial = {
        ...baseDeps,
        removedLabelMode: 'special-label' as const,
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([
          'pulsarr:bob',
          'pulsarr:removed',
          'other-label',
        ]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 2,
          plex_rating_key: '123',
          labels_applied: ['pulsarr:bob'],
          synced_at: new Date().toISOString(),
        },
        {
          id: 2,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: null,
          plex_rating_key: '123',
          labels_applied: ['pulsarr:removed'],
          synced_at: new Date().toISOString(),
        },
      ])
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, depsSpecial)

      expect(result).toBe(true)
      // Should remove pulsarr:removed since users exist
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:bob',
        'pulsarr:alice',
      ])
    })

    it('should filter removed labels from tracked labels in special-label mode', async () => {
      const depsSpecial = {
        ...baseDeps,
        removedLabelMode: 'special-label' as const,
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata(['other-label']),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getTrackedLabelsForRatingKey).mockResolvedValue([
        {
          id: 1,
          content_guids: ['imdb:tt0111161'],
          content_type: 'movie',
          user_id: 2,
          plex_rating_key: '123',
          labels_applied: ['pulsarr:bob', 'pulsarr:removed:old'],
          synced_at: new Date().toISOString(),
        },
      ])
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, depsSpecial)

      expect(result).toBe(true)
      // Should keep bob but filter out pulsarr:removed:old
      expect(mockPlexServer.updateLabels).toHaveBeenCalledWith('123', [
        'other-label',
        'pulsarr:bob',
        'pulsarr:alice',
      ])
    })
  })

  describe('Tracking', () => {
    it('should track labels in database after applying', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
        ['imdb:tt0111161'],
        'movie',
        1,
        '123',
        ['pulsarr:alice'],
      )
    })

    it('should track combined user and tag labels', async () => {
      const depsWithTagSync = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false,
          },
        },
      }

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]
      const webhookTags = ['action', 'thriller']

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        depsWithTagSync,
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)
      // Should track user label + tag labels together
      expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
        ['imdb:tt0111161'],
        'movie',
        1,
        '123',
        ['pulsarr:alice', 'pulsarr:action', 'pulsarr:thriller'],
      )
    })

    it('should handle tracking errors gracefully', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      vi.mocked(mockDb.trackPlexLabels).mockRejectedValue(
        new Error('Database error'),
      )

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      // Should still return true (labels applied successfully)
      expect(result).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Failed to track combined labels'),
      )
    })

    it('should use ratingKey as fallback when watchlist item not found', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue(undefined)
      vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(true)
      // Should use ratingKey as content GUID fallback
      expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
        ['123'],
        'movie',
        1,
        '123',
        ['pulsarr:alice'],
      )
    })

    it('should use fallback content type when watchlist type is invalid', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(true)
      vi.mocked(mockDb.getWatchlistItemById).mockResolvedValue({
        user_id: 1,
        guids: ['imdb:tt0111161'],
        type: 'invalid' as 'movie',
        title: 'Test Movie',
        key: 'test-key-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      vi.mocked(mockDb.trackPlexLabels).mockResolvedValue(1)

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem(
        '123',
        users,
        baseDeps,
        undefined,
        'show',
      )

      expect(result).toBe(true)
      // Should use 'show' from contentType parameter
      expect(mockDb.trackPlexLabels).toHaveBeenCalledWith(
        ['imdb:tt0111161'],
        'show',
        1,
        '123',
        ['pulsarr:alice'],
      )
    })
  })

  describe('Error handling', () => {
    it('should return false when updateLabels fails', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockResolvedValue(false)

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(false)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update combined labels'),
      )
    })

    it('should return false and log error when exception occurs', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockRejectedValue(
        new Error('Network error'),
      )

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Error applying combined labels'),
      )
    })

    it('should handle updateLabels exception', async () => {
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadata([]),
      )
      vi.mocked(mockPlexServer.updateLabels).mockRejectedValue(
        new Error('Plex API error'),
      )

      const users = [{ user_id: 1, username: 'alice', watchlist_id: 1 }]

      const result = await applyLabelsToSingleItem('123', users, baseDeps)

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Error applying combined labels'),
      )
    })
  })
})
