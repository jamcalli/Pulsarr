/**
 * Integration tests for pending synchronization workflow
 *
 * Tests the pending sync processing including retry logic, content-centric user
 * gathering from tracking table, and expired sync cleanup with real database.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { processPendingLabelSyncs } from '@services/plex-label-sync/orchestration/pending-sync.js'
import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../../helpers/database.js'
import { SEED_USERS, seedAll } from '../../../helpers/seeds/index.js'

describe('Pending Sync → Workflow Integration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await initializeTestDatabase()
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('processPendingLabelSyncs', () => {
    it('should process pending sync when content becomes available', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-pending-1',
          status: 'grabbed',
        })
        .returning('*')

      // Create pending sync record
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify(['action']),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Mock PlexServer - content now available
      const mockSearchByGuid = vi
        .fn()
        .mockImplementation(async (guid: string) => {
          if (guid === 'plex://movie/test-key-pending-1') {
            return [
              {
                ratingKey: '12345',
                title: 'The Shawshank Redemption',
                type: 'movie',
              },
            ]
          }
          return []
        })

      const mockGetMetadata = vi.fn().mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'The Shawshank Redemption',
        Label: [],
      })

      const mockUpdateLabels = vi.fn().mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Process pending syncs
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          tagSync: {
            enabled: true,
            syncRadarrTags: true,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify results
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)

      // Verify Plex API calls
      expect(mockSearchByGuid).toHaveBeenCalledWith(
        'plex://movie/test-key-pending-1',
      )
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:action',
      ])

      // Verify pending sync removed
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })
      expect(pendingSyncs).toHaveLength(0)

      // Verify tracking record created
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      const labels = JSON.parse(tracking[0].labels_applied as string)
      expect(labels).toEqual(
        expect.arrayContaining(['pulsarr:test-user-primary', 'pulsarr:action']),
      )
    })

    it('should update retry count when content still not available', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt9999999', 'tmdb:9999999']),
          type: 'movie',
          title: 'Not Available Yet',
          key: 'test-key-retry',
          status: 'grabbed',
        })
        .returning('*')

      // Create pending sync record
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Mock PlexServer - content still not found
      const mockSearchByGuid = vi.fn().mockResolvedValue([])

      app.plexServerService.searchByGuid = mockSearchByGuid

      // Process pending syncs
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify results
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.pending).toBe(1)

      // Verify retry count incremented
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(pendingSyncs).toHaveLength(1)
      expect(pendingSyncs[0].retry_count).toBe(1)
    })

    it('should gather all users from tracking table (content-centric)', async () => {
      const knex = getTestDatabase()

      // Create watchlist items for both users with different keys but same content
      // This tests the content-centric approach where both users should get labels
      const [watchlistItem1, watchlistItem2] = await knex('watchlist_items')
        .insert([
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-multi-user-1',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
            type: 'movie',
            title: 'The Shawshank Redemption',
            key: 'test-key-multi-user-2',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Create pending syncs for both users
      // Both will resolve to the same Plex content (rating key 12345)
      // The second one processed should gather both users (content-centric)
      await knex('pending_label_syncs').insert([
        {
          watchlist_item_id: watchlistItem1.id,
          content_title: watchlistItem1.title,
          retry_count: 0,
          webhook_tags: JSON.stringify([]),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        {
          watchlist_item_id: watchlistItem2.id,
          content_title: watchlistItem2.title,
          retry_count: 0,
          webhook_tags: JSON.stringify([]),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ])

      // Mock PlexServer
      const mockSearchByGuid = vi
        .fn()
        .mockImplementation(async (guid: string) => {
          if (
            guid === 'plex://movie/test-key-multi-user-1' ||
            guid === 'plex://movie/test-key-multi-user-2'
          ) {
            return [
              {
                ratingKey: '12345',
                title: 'The Shawshank Redemption',
                type: 'movie',
              },
            ]
          }
          return []
        })

      const mockGetMetadata = vi.fn().mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'The Shawshank Redemption',
        Label: [{ tag: 'pulsarr:test-user-primary' }],
      })

      const mockUpdateLabels = vi.fn().mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Process pending syncs
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify success - both pending syncs processed
      expect(result.processed).toBe(2)
      expect(result.updated).toBe(2)

      // Verify labels applied for both users (processed individually)
      expect(mockUpdateLabels).toHaveBeenCalledTimes(2)

      // Verify tracking records for both users
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)
      expect(tracking[0].user_id).toBe(SEED_USERS[0].id)
      expect(tracking[1].user_id).toBe(SEED_USERS[1].id)
    })

    it('should handle missing Plex key (no GUID part)', async () => {
      const knex = getTestDatabase()

      // Create watchlist item without Plex key
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'No Key Movie',
          key: 'placeholder-no-key', // Placeholder key for missing content
          status: 'pending',
        })
        .returning('*')

      // Create pending sync record
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Mock PlexServer - content not found
      const mockSearchByGuid = vi.fn().mockResolvedValue([])
      app.plexServerService.searchByGuid = mockSearchByGuid

      // Process pending syncs
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify retry count incremented but sync still pending
      expect(result.processed).toBe(1)
      expect(result.pending).toBe(1)

      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(pendingSyncs).toHaveLength(1)
      expect(pendingSyncs[0].retry_count).toBe(1)
    })

    it('should remove pending sync when user not found', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-missing-user',
          status: 'grabbed',
        })
        .returning('*')

      // Create pending sync
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Delete the user to create orphaned watchlist item
      // Temporarily disable foreign key checks to delete user
      await knex.raw('PRAGMA foreign_keys = OFF')
      await knex('users').where('id', SEED_USERS[0].id).delete()
      await knex.raw('PRAGMA foreign_keys = ON')

      // Process pending syncs
      const _result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify pending sync was removed
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(pendingSyncs).toHaveLength(0)
    })

    it('should clean up expired pending syncs', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'Expired Sync',
          key: 'test-key-expired',
          status: 'grabbed',
        })
        .returning('*')

      // Create expired pending sync (expires_at in the past)
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 50, // High retry count
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        created_at: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days old
      })

      // Mock PlexServer - content not found (will increment retry count)
      const mockSearchByGuid = vi.fn().mockResolvedValue([])
      app.plexServerService.searchByGuid = mockSearchByGuid

      // Spy on expiration to verify it's called
      const spyExpire = vi.spyOn(app.db, 'expirePendingLabelSyncs')

      // Process pending syncs (this should clean up expired records)
      await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify expiration was called
      expect(spyExpire).toHaveBeenCalledTimes(1)

      // Verify the expired pending sync was deleted
      const remainingRecords = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(remainingRecords).toHaveLength(0)
    })

    it('should skip processing when sync is disabled', async () => {
      const knex = getTestDatabase()

      // Create watchlist item and pending sync
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-disabled',
          status: 'grabbed',
        })
        .returning('*')

      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Process with sync disabled
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: false,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify no processing
      expect(result.processed).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.failed).toBe(0)

      // Verify pending sync still exists
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(pendingSyncs).toHaveLength(1)
    })

    it('should handle errors and update retry count', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'Error Movie',
          key: 'test-key-error',
          status: 'grabbed',
        })
        .returning('*')

      // Create pending sync
      await knex('pending_label_syncs').insert({
        watchlist_item_id: watchlistItem.id,
        content_title: watchlistItem.title,
        retry_count: 0,
        webhook_tags: JSON.stringify([]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      // Mock PlexServer to throw error
      const mockSearchByGuid = vi
        .fn()
        .mockRejectedValue(new Error('Plex API error'))

      app.plexServerService.searchByGuid = mockSearchByGuid

      // Process pending syncs
      const result = await processPendingLabelSyncs({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
        } as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify error handling
      expect(result.processed).toBe(1)
      expect(result.failed).toBe(1)

      // Verify retry count incremented
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: watchlistItem.id,
      })

      expect(pendingSyncs).toHaveLength(1)
      expect(pendingSyncs[0].retry_count).toBe(1)
    })
  })
})
