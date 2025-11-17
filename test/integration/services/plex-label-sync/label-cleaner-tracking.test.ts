/**
 * Integration tests for label-cleaner → tracking cleanup flow
 *
 * Tests the full label cleanup flow with real database operations and mocked
 * PlexServer. Verifies that tracking table state matches expected state after
 * cleanup operations in different modes (remove/keep/special-label).
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import {
  cleanupLabelsForWatchlistItems,
  cleanupOrphanedPlexLabels,
} from '@services/plex-label-sync/cleanup/label-cleaner.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../../helpers/database.js'
import { SEED_USERS, seedAll } from '../../../helpers/seeds/index.js'

describe('Label Cleaner → Tracking Cleanup Integration', () => {
  beforeEach(async () => {
    await initializeTestDatabase()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('cleanupLabelsForWatchlistItems - Remove Mode', () => {
    it('should remove labels from Plex and cleanup tracking for single user', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-cleanup-1',
          status: 'grabbed',
        })
        .returning('*')

      // Create tracking record
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
      })

      const deletedItems = [
        {
          id: watchlistItem.id,
          title: 'The Shawshank Redemption',
          key: 'test-key-cleanup-1',
          user_id: SEED_USERS[0].id,
          guids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie' as const,
        },
      ]
      // Don't delete the item yet - cleanup function needs to fetch it from DB

      // Mock PlexServer
      const mockRemoveSpecificLabels = vi.fn().mockResolvedValue(true)
      app.plexServerService.removeSpecificLabels = mockRemoveSpecificLabels

      // Perform cleanup
      await cleanupLabelsForWatchlistItems(deletedItems, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        radarrManager: app.radarrManager,
        sonarrManager: app.sonarrManager,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels were removed
      expect(mockRemoveSpecificLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking record was deleted
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(0)
    })

    it('should handle multiple users with separate tracking cleanup', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist items for both users
      const watchlistItems = await knex('watchlist_items')
        .insert([
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-cleanup-user1',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-cleanup-user2',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Create tracking records for both users
      await knex('plex_label_tracking').insert([
        {
          content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
      ])

      // Mock PlexServer
      const mockRemoveSpecificLabels = vi.fn().mockResolvedValue(true)
      app.plexServerService.removeSpecificLabels = mockRemoveSpecificLabels

      // Only cleanup for user 1
      await cleanupLabelsForWatchlistItems(
        [
          {
            id: watchlistItems[0].id,
            title: 'The Shawshank Redemption',
            key: 'test-key-cleanup-user1',
            user_id: SEED_USERS[0].id,
            guids: ['imdb:tt0111161', 'tmdb:278'],
            contentType: 'movie' as const,
          },
        ],
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
            enabled: true,
          } as PlexLabelSyncConfig,
          radarrManager: app.radarrManager,
          sonarrManager: app.sonarrManager,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'remove',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
        },
      )

      // Verify only user 1's labels were removed
      expect(mockRemoveSpecificLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify only user 1's tracking was deleted
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(1)
      expect(tracking[0].user_id).toBe(SEED_USERS[1].id)
    })
  })

  describe('cleanupLabelsForWatchlistItems - Keep Mode', () => {
    it('should preserve labels and tracking in keep mode', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-keep-mode',
          status: 'grabbed',
        })
        .returning('*')

      // Create tracking record
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
      })

      // Mock PlexServer
      const mockRemoveSpecificLabels = vi.fn()
      app.plexServerService.removeSpecificLabels = mockRemoveSpecificLabels

      const watchlistItems = [
        {
          id: watchlistItem.id,
          title: 'The Shawshank Redemption',
          key: 'test-key-keep-mode',
          user_id: SEED_USERS[0].id,
          guids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie' as const,
        },
      ]

      // Perform cleanup in keep mode
      await cleanupLabelsForWatchlistItems(watchlistItems, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        radarrManager: app.radarrManager,
        sonarrManager: app.sonarrManager,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'keep',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify no Plex operations
      expect(mockRemoveSpecificLabels).not.toHaveBeenCalled()

      // Verify tracking record still exists
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      expect(JSON.parse(tracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-primary',
      ])
    })
  })

  describe('cleanupLabelsForWatchlistItems - Special-Label Mode', () => {
    it('should apply removed label when last user removes content', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-special-label',
          status: 'grabbed',
        })
        .returning('*')

      // Create tracking record (only one user)
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
      })

      // Mock PlexServer
      const mockGetCurrentLabels = vi
        .fn()
        .mockResolvedValue(['pulsarr:test-user-primary'])
      const mockUpdateLabels = vi.fn().mockResolvedValue(true)
      app.plexServerService.getCurrentLabels = mockGetCurrentLabels
      app.plexServerService.updateLabels = mockUpdateLabels

      const watchlistItems = [
        {
          id: watchlistItem.id,
          title: 'The Shawshank Redemption',
          key: 'test-key-special-label',
          user_id: SEED_USERS[0].id,
          guids: ['imdb:tt0111161', 'tmdb:278'],
          contentType: 'movie' as const,
        },
      ]

      // Perform cleanup in special-label mode
      await cleanupLabelsForWatchlistItems(watchlistItems, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        radarrManager: app.radarrManager,
        sonarrManager: app.sonarrManager,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'special-label',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify removed label was applied
      expect(mockUpdateLabels).toHaveBeenCalledWith(
        '12345',
        expect.arrayContaining(['pulsarr:removed']),
      )

      // Verify user tracking was deleted
      const userTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })
      expect(userTracking).toHaveLength(0)

      // Verify system tracking was created (user_id = null)
      const systemTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: null,
      })
      expect(systemTracking).toHaveLength(1)
      expect(JSON.parse(systemTracking[0].labels_applied as string)).toEqual([
        'pulsarr:removed',
      ])
    })

    it('should remove only specific user label when other users remain', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist items for both users
      const watchlistItems = await knex('watchlist_items')
        .insert([
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-special-multi-user1',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-special-multi-user2',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Create tracking records for both users
      await knex('plex_label_tracking').insert([
        {
          content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
      ])

      // Mock PlexServer
      const mockGetCurrentLabels = vi
        .fn()
        .mockResolvedValue([
          'pulsarr:test-user-primary',
          'pulsarr:test-user-discord-apprise',
          'external-label',
        ])
      const mockUpdateLabels = vi.fn().mockResolvedValue(true)
      app.plexServerService.getCurrentLabels = mockGetCurrentLabels
      app.plexServerService.updateLabels = mockUpdateLabels

      // Only cleanup for user 1
      await cleanupLabelsForWatchlistItems(
        [
          {
            id: watchlistItems[0].id,
            title: 'The Shawshank Redemption',
            key: 'test-key-special-multi-user1',
            user_id: SEED_USERS[0].id,
            guids: ['imdb:tt0111161', 'tmdb:278'],
            contentType: 'movie' as const,
          },
        ],
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
            enabled: true,
          } as PlexLabelSyncConfig,
          radarrManager: app.radarrManager,
          sonarrManager: app.sonarrManager,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'special-label',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
        },
      )

      // Verify only user 1's label was removed, user 2's preserved
      expect(mockUpdateLabels).toHaveBeenCalledWith(
        '12345',
        expect.arrayContaining([
          'pulsarr:test-user-discord-apprise',
          'external-label',
        ]),
      )

      const updateCall = mockUpdateLabels.mock.calls[0][1]
      expect(updateCall).not.toContain('pulsarr:test-user-primary')
      expect(updateCall).not.toContain('pulsarr:removed')

      // Verify user 1's tracking was deleted, user 2's preserved
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(1)
      expect(tracking[0].user_id).toBe(SEED_USERS[1].id)

      // Verify no system tracking created
      const systemTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: null,
      })
      expect(systemTracking).toHaveLength(0)
    })

    it('should handle multiple users removing different content in same batch (bug fix verification)', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Scenario: User A removes Movie X, User B removes Movie Y, User C has both
      // Bug: Without fix, User B's label would be incorrectly removed from Movie X
      // and User A's label would be incorrectly removed from Movie Y

      // Create watchlist items for all users and both movies
      const watchlistItems = await knex('watchlist_items')
        .insert([
          // User A (SEED_USERS[0]) has both movies
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
            type: 'movie',
            title: 'The Matrix',
            key: 'matrix-user-a',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
            type: 'movie',
            title: 'Inception',
            key: 'inception-user-a',
            status: 'grabbed',
          },
          // User B (SEED_USERS[1]) has both movies
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
            type: 'movie',
            title: 'The Matrix',
            key: 'matrix-user-b',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
            type: 'movie',
            title: 'Inception',
            key: 'inception-user-b',
            status: 'grabbed',
          },
          // User C (SEED_USERS[2]) has both movies
          {
            user_id: SEED_USERS[2].id,
            guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
            type: 'movie',
            title: 'The Matrix',
            key: 'matrix-user-c',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[2].id,
            guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
            type: 'movie',
            title: 'Inception',
            key: 'inception-user-c',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Create tracking records for both movies with all three users
      await knex('plex_label_tracking').insert([
        // The Matrix - all three users
        {
          content_guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: 'matrix-123',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: 'matrix-123',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0133093', 'tmdb:603']),
          content_type: 'movie',
          user_id: SEED_USERS[2].id,
          plex_rating_key: 'matrix-123',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-only']),
        },
        // Inception - all three users
        {
          content_guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: 'inception-456',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: 'inception-456',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt1375666', 'tmdb:27205']),
          content_type: 'movie',
          user_id: SEED_USERS[2].id,
          plex_rating_key: 'inception-456',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-only']),
        },
      ])

      // Mock PlexServer - track all calls
      const getCurrentLabelsCalls: string[] = []
      const updateLabelsCalls: Array<{ ratingKey: string; labels: string[] }> =
        []

      const mockGetCurrentLabels = vi.fn().mockImplementation((ratingKey) => {
        getCurrentLabelsCalls.push(ratingKey)
        if (ratingKey === 'matrix-123') {
          return [
            'pulsarr:test-user-primary',
            'pulsarr:test-user-discord-apprise',
            'pulsarr:test-user-discord-only',
          ]
        }
        if (ratingKey === 'inception-456') {
          return [
            'pulsarr:test-user-primary',
            'pulsarr:test-user-discord-apprise',
            'pulsarr:test-user-discord-only',
          ]
        }
        return []
      })

      const mockUpdateLabels = vi
        .fn()
        .mockImplementation((ratingKey, labels) => {
          updateLabelsCalls.push({ ratingKey, labels })
          return true
        })

      app.plexServerService.getCurrentLabels = mockGetCurrentLabels
      app.plexServerService.updateLabels = mockUpdateLabels

      // User A removes The Matrix, User B removes Inception (in same batch!)
      // User C keeps both movies
      await cleanupLabelsForWatchlistItems(
        [
          {
            id: watchlistItems[0].id, // User A - Matrix
            title: 'The Matrix',
            key: 'matrix-user-a',
            user_id: SEED_USERS[0].id,
            guids: ['imdb:tt0133093', 'tmdb:603'],
            contentType: 'movie' as const,
          },
          {
            id: watchlistItems[3].id, // User B - Inception
            title: 'Inception',
            key: 'inception-user-b',
            user_id: SEED_USERS[1].id,
            guids: ['imdb:tt1375666', 'tmdb:27205'],
            contentType: 'movie' as const,
          },
        ],
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
            enabled: true,
          } as PlexLabelSyncConfig,
          radarrManager: app.radarrManager,
          sonarrManager: app.sonarrManager,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'special-label',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
        },
      )

      // CRITICAL ASSERTIONS: Verify the bug is fixed

      // 1. The Matrix should have User A's label removed, but User B and C preserved
      const matrixUpdate = updateLabelsCalls.find(
        (c) => c.ratingKey === 'matrix-123',
      )
      expect(matrixUpdate).toBeDefined()
      expect(matrixUpdate?.labels).toContain(
        'pulsarr:test-user-discord-apprise',
      ) // User B still has it
      expect(matrixUpdate?.labels).toContain('pulsarr:test-user-discord-only') // User C still has it
      expect(matrixUpdate?.labels).not.toContain('pulsarr:test-user-primary') // User A removed it
      expect(matrixUpdate?.labels).not.toContain('pulsarr:removed') // Other users remain, no removal label

      // 2. Inception should have User B's label removed, but User A and C preserved
      const inceptionUpdate = updateLabelsCalls.find(
        (c) => c.ratingKey === 'inception-456',
      )
      expect(inceptionUpdate).toBeDefined()
      expect(inceptionUpdate?.labels).toContain('pulsarr:test-user-primary') // User A still has it
      expect(inceptionUpdate?.labels).toContain(
        'pulsarr:test-user-discord-only',
      ) // User C still has it
      expect(inceptionUpdate?.labels).not.toContain(
        'pulsarr:test-user-discord-apprise',
      ) // User B removed it
      expect(inceptionUpdate?.labels).not.toContain('pulsarr:removed') // Other users remain, no removal label

      // 3. Verify tracking records
      const matrixTracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: 'matrix-123' })
        .orderBy('user_id')

      // Should have User B and C, not User A
      expect(matrixTracking).toHaveLength(2)
      expect(matrixTracking.map((t) => t.user_id)).toEqual([
        SEED_USERS[1].id,
        SEED_USERS[2].id,
      ])

      const inceptionTracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: 'inception-456' })
        .orderBy('user_id')

      // Should have User A and C, not User B
      expect(inceptionTracking).toHaveLength(2)
      expect(inceptionTracking.map((t) => t.user_id)).toEqual([
        SEED_USERS[0].id,
        SEED_USERS[2].id,
      ])
    })
  })

  describe('cleanupOrphanedPlexLabels', () => {
    it('should cleanup orphaned labels and tracking records', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create tracking records for a user that no longer exists (orphaned)
      // Temporarily disable foreign key checks to insert orphaned record
      await knex.raw('PRAGMA foreign_keys = OFF')
      await knex('plex_label_tracking').insert([
        {
          content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          content_type: 'movie',
          user_id: 999, // Non-existent user
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:deleted-user']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0068646', 'tmdb:238']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id, // Valid user
          plex_rating_key: '67890',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
      ])
      await knex.raw('PRAGMA foreign_keys = ON')

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      mockGetMetadata
        .mockResolvedValueOnce({
          ratingKey: '12345',
          key: '/library/metadata/12345',
          title: 'Movie 1',
          Label: [{ tag: 'pulsarr:deleted-user' }],
        })
        .mockResolvedValueOnce({
          ratingKey: '67890',
          key: '/library/metadata/67890',
          title: 'Movie 2',
          Label: [{ tag: 'pulsarr:test-user-primary' }],
        })

      const mockUpdateLabels = vi.fn().mockResolvedValue(true)
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Run orphaned cleanup
      const result = await cleanupOrphanedPlexLabels(undefined, undefined, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          cleanupOrphanedLabels: true,
        } as PlexLabelSyncConfig,
        radarrManager: app.radarrManager,
        sonarrManager: app.sonarrManager,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Should have removed 1 orphaned label
      expect(result.removed).toBe(1)
      expect(result.failed).toBe(0)

      // Verify orphaned label was removed from Plex
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [])

      // Verify valid label was NOT touched
      const validUpdateCall = mockUpdateLabels.mock.calls.find(
        (call) => call[0] === '67890',
      )
      expect(validUpdateCall).toBeUndefined() // Should not update if no orphans

      // Verify orphaned tracking was cleaned up
      const orphanedTracking = await knex('plex_label_tracking').where({
        user_id: 999,
      })
      expect(orphanedTracking).toHaveLength(0)

      // Verify valid tracking still exists
      const validTracking = await knex('plex_label_tracking').where({
        user_id: SEED_USERS[0].id,
      })
      expect(validTracking).toHaveLength(1)
    })

    it('should handle tag sync when detecting orphaned labels', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Enable tag sync in config
      const configWithTags = {
        ...app.config.plexLabelSync,
        enabled: true,
        tagSync: {
          enabled: true,
          syncRadarrTags: true,
          syncSonarrTags: false,
        },
      } as PlexLabelSyncConfig

      // Create tracking with tag labels
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify([
          'pulsarr:test-user-primary',
          'pulsarr:action', // Tag label
        ]),
      })

      // Mock Radarr to return tag data
      const mockGetTags = vi.fn().mockResolvedValue([
        { id: 1, label: 'action' },
        { id: 2, label: 'hd' },
      ])

      const mockRadarrService = {
        getTags: mockGetTags,
      }

      app.radarrManager.getAllInstances = vi.fn().mockResolvedValue([
        {
          id: 1,
          name: 'radarr-main',
          baseUrl: 'http://localhost:7878',
          apiKey: 'test',
          qualityProfile: null,
          rootFolder: null,
          bypassIgnored: false,
          tags: [],
          isDefault: true,
        },
      ])

      app.radarrManager.getRadarrService = vi
        .fn()
        .mockReturnValue(mockRadarrService)

      // Mock Sonarr to return empty instances since syncSonarrTags is false
      app.sonarrManager.getAllInstances = vi.fn().mockResolvedValue([])

      // Mock PlexServer
      const mockGetMetadata = vi.fn().mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        title: 'Test Movie',
        Label: [
          { tag: 'pulsarr:test-user-primary' },
          { tag: 'pulsarr:action' },
        ],
      })

      app.plexServerService.getMetadata = mockGetMetadata

      // Run orphaned cleanup with tag sync enabled
      const result = await cleanupOrphanedPlexLabels(undefined, undefined, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...configWithTags,
          cleanupOrphanedLabels: true,
        } as PlexLabelSyncConfig,
        radarrManager: app.radarrManager,
        sonarrManager: app.sonarrManager,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Should not remove any labels since both are valid
      expect(result.removed).toBe(0)

      // Verify Radarr was queried for tags
      expect(app.radarrManager.getAllInstances).toHaveBeenCalled()
      expect(mockGetTags).toHaveBeenCalled()
    })
  })
})
