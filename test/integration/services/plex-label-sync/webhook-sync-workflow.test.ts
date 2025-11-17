/**
 * Integration tests for webhook synchronization workflow
 *
 * Tests the real-time webhook-triggered label sync including GUID resolution,
 * tag extraction, and queueing with real database operations and mocked Plex.
 */

import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import {
  syncLabelForNewWatchlistItem,
  syncLabelForWatchlistItem,
  syncLabelsOnWebhook,
} from '@services/plex-label-sync/orchestration/webhook-sync.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../../helpers/database.js'
import { SEED_USERS, seedAll } from '../../../helpers/seeds/index.js'

describe('Webhook Sync → Workflow Integration', () => {
  beforeEach(async () => {
    await initializeTestDatabase()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('syncLabelsOnWebhook', () => {
    it('should sync labels for existing watchlist item on webhook', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'The Shawshank Redemption',
        key: 'test-key-webhook-1',
        status: 'grabbed',
      })

      // Mock PlexServer
      const mockSearchByGuid = vi.fn().mockResolvedValue([
        {
          ratingKey: '12345',
          title: 'The Shawshank Redemption',
          type: 'movie',
        },
      ])

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

      // Mock webhook payload
      const webhook = {
        instanceName: 'radarr-main',
        movie: {
          title: 'The Shawshank Redemption',
          tmdbId: 278,
          tags: ['action', 'drama'],
        },
      } as unknown as WebhookPayload

      // Mock dependency functions
      const mockExtractContentGuidFromWebhook = vi
        .fn()
        .mockReturnValue({ guids: ['imdb:tt0111161'], contentType: 'movie' })

      const mockExtractTagsFromWebhook = vi
        .fn()
        .mockReturnValue(['action', 'drama'])

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      const mockFetchTagsForWatchlistItem = vi.fn().mockResolvedValue([])

      // Run webhook sync
      const result = await syncLabelsOnWebhook(webhook, {
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
        radarrManager: {} as RadarrManagerService,
        sonarrManager: {} as SonarrManagerService,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        extractContentGuidFromWebhook: mockExtractContentGuidFromWebhook,
        extractTagsFromWebhook: mockExtractTagsFromWebhook,
        queuePendingLabelSyncByWatchlistId:
          mockQueuePendingLabelSyncByWatchlistId,
        fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
      })

      // Verify success
      expect(result).toBe(true)

      // Verify Plex API calls
      expect(mockSearchByGuid).toHaveBeenCalledWith(
        'plex://movie/test-key-webhook-1',
      )
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:action',
        'pulsarr:drama',
      ])

      // Verify tracking record created
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      const labels = JSON.parse(tracking[0].labels_applied as string)
      expect(labels).toEqual(
        expect.arrayContaining([
          'pulsarr:test-user-primary',
          'pulsarr:action',
          'pulsarr:drama',
        ]),
      )

      await app.close()
    })

    it('should queue when content not yet in Plex', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'The Shawshank Redemption',
        key: 'test-key-webhook-queue',
        status: 'grabbed',
      })

      // Mock PlexServer - content not found
      const mockSearchByGuid = vi.fn().mockResolvedValue([])

      app.plexServerService.searchByGuid = mockSearchByGuid

      // Mock webhook payload
      const webhook = {
        instanceName: 'radarr-main',
        movie: {
          title: 'The Shawshank Redemption',
          tmdbId: 278,
          tags: ['action'],
        },
      } as unknown as WebhookPayload

      // Mock dependency functions
      const mockExtractContentGuidFromWebhook = vi
        .fn()
        .mockReturnValue({ guids: ['imdb:tt0111161'], contentType: 'movie' })

      const mockExtractTagsFromWebhook = vi.fn().mockReturnValue(['action'])

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      const mockFetchTagsForWatchlistItem = vi.fn().mockResolvedValue([])

      // Run webhook sync
      const result = await syncLabelsOnWebhook(webhook, {
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
        radarrManager: {} as RadarrManagerService,
        sonarrManager: {} as SonarrManagerService,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        extractContentGuidFromWebhook: mockExtractContentGuidFromWebhook,
        extractTagsFromWebhook: mockExtractTagsFromWebhook,
        queuePendingLabelSyncByWatchlistId:
          mockQueuePendingLabelSyncByWatchlistId,
        fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
      })

      // Content not found, should be queued
      expect(result).toBe(false)
      expect(mockQueuePendingLabelSyncByWatchlistId).toHaveBeenCalledTimes(1)

      await app.close()
    })

    it('should handle multiple users with same content', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist items for both users
      await knex('watchlist_items').insert([
        {
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-webhook-multi-1',
          status: 'grabbed',
        },
        {
          user_id: SEED_USERS[1].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-webhook-multi-2',
          status: 'grabbed',
        },
      ])

      // Mock PlexServer
      const mockSearchByGuid = vi.fn().mockResolvedValue([
        {
          ratingKey: '12345',
          title: 'The Shawshank Redemption',
          type: 'movie',
        },
      ])

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

      // Mock webhook payload
      const webhook = {
        instanceName: 'radarr-main',
        movie: {
          title: 'The Shawshank Redemption',
          tmdbId: 278,
          tags: ['action'],
        },
      } as unknown as WebhookPayload

      // Mock dependency functions
      const mockExtractContentGuidFromWebhook = vi
        .fn()
        .mockReturnValue({ guids: ['imdb:tt0111161'], contentType: 'movie' })

      const mockExtractTagsFromWebhook = vi.fn().mockReturnValue(['action'])

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      const mockFetchTagsForWatchlistItem = vi.fn().mockResolvedValue([])

      // Run webhook sync
      const result = await syncLabelsOnWebhook(webhook, {
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
        radarrManager: {} as RadarrManagerService,
        sonarrManager: {} as SonarrManagerService,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        extractContentGuidFromWebhook: mockExtractContentGuidFromWebhook,
        extractTagsFromWebhook: mockExtractTagsFromWebhook,
        queuePendingLabelSyncByWatchlistId:
          mockQueuePendingLabelSyncByWatchlistId,
        fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
      })

      // Verify success
      expect(result).toBe(true)

      // Verify both user labels applied
      expect(mockUpdateLabels).toHaveBeenCalledTimes(2)

      // Verify tracking records for both users
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)

      await app.close()
    })

    it('should skip when sync is disabled', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-disabled',
        status: 'grabbed',
      })

      // Mock webhook payload
      const webhook = {
        instanceName: 'radarr-main',
        movie: {
          title: 'Test Movie',
          tmdbId: 278,
          tags: [],
        },
      } as unknown as WebhookPayload

      const mockExtractContentGuidFromWebhook = vi.fn()
      const mockExtractTagsFromWebhook = vi.fn()
      const mockQueuePendingLabelSyncByWatchlistId = vi.fn()
      const mockFetchTagsForWatchlistItem = vi.fn()

      // Run webhook sync with sync disabled
      const result = await syncLabelsOnWebhook(webhook, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: false,
        } as PlexLabelSyncConfig,
        radarrManager: {} as RadarrManagerService,
        sonarrManager: {} as SonarrManagerService,
        fastify: app,
        labelPrefix: 'pulsarr',
        removedLabelPrefix: 'pulsarr:removed',
        removedLabelMode: 'remove',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        extractContentGuidFromWebhook: mockExtractContentGuidFromWebhook,
        extractTagsFromWebhook: mockExtractTagsFromWebhook,
        queuePendingLabelSyncByWatchlistId:
          mockQueuePendingLabelSyncByWatchlistId,
        fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
      })

      // Verify no processing occurred
      expect(result).toBe(false)
      expect(mockExtractContentGuidFromWebhook).not.toHaveBeenCalled()

      await app.close()
    })
  })

  describe('syncLabelForNewWatchlistItem', () => {
    it('should sync labels for new watchlist item immediately', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'New Movie',
          key: 'test-key-new-item',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer
      const mockSearchByGuid = vi.fn().mockResolvedValue([
        {
          ratingKey: '12345',
          title: 'New Movie',
          type: 'movie',
        },
      ])

      const mockGetMetadata = vi.fn().mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'New Movie',
        Label: [],
      })

      const mockUpdateLabels = vi.fn().mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      const mockFetchTagsForWatchlistItem = vi
        .fn()
        .mockResolvedValue(['action', 'drama'])

      // Sync new watchlist item with tag fetching
      const result = await syncLabelForNewWatchlistItem(
        Number(watchlistItem.id),
        watchlistItem.title,
        true, // fetchTags
        {
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
          radarrManager: {} as RadarrManagerService,
          sonarrManager: {} as SonarrManagerService,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'remove',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
          extractContentGuidFromWebhook: vi.fn(),
          extractTagsFromWebhook: vi.fn(),
          queuePendingLabelSyncByWatchlistId:
            mockQueuePendingLabelSyncByWatchlistId,
          fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
        },
      )

      // Verify success
      expect(result).toBe(true)
      expect(mockFetchTagsForWatchlistItem).toHaveBeenCalled()

      // Verify labels applied with tags
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:action',
        'pulsarr:drama',
      ])

      await app.close()
    })

    it('should queue when content not found and include fetched tags', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt9999999', 'tmdb:9999999']),
          type: 'movie',
          title: 'Not In Plex',
          key: 'test-key-not-found',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer - content not found
      const mockSearchByGuid = vi.fn().mockResolvedValue([])

      app.plexServerService.searchByGuid = mockSearchByGuid

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      const mockFetchTagsForWatchlistItem = vi
        .fn()
        .mockResolvedValue(['action'])

      // Sync new watchlist item
      const result = await syncLabelForNewWatchlistItem(
        Number(watchlistItem.id),
        watchlistItem.title,
        true, // fetchTags
        {
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
          radarrManager: {} as RadarrManagerService,
          sonarrManager: {} as SonarrManagerService,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'remove',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
          extractContentGuidFromWebhook: vi.fn(),
          extractTagsFromWebhook: vi.fn(),
          queuePendingLabelSyncByWatchlistId:
            mockQueuePendingLabelSyncByWatchlistId,
          fetchTagsForWatchlistItem: mockFetchTagsForWatchlistItem,
        },
      )

      // Content not found, should be queued
      expect(result).toBe(false)
      expect(mockQueuePendingLabelSyncByWatchlistId).toHaveBeenCalledWith(
        Number(watchlistItem.id),
        watchlistItem.title,
        ['action'], // Fetched tags should be included
      )

      await app.close()
    })
  })

  describe('syncLabelForWatchlistItem', () => {
    it('should sync labels for single watchlist item', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-single',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer
      const mockSearchByGuid = vi.fn().mockResolvedValue([
        {
          ratingKey: '12345',
          title: 'Test Movie',
          type: 'movie',
        },
      ])

      const mockGetMetadata = vi.fn().mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })

      const mockUpdateLabels = vi.fn().mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      // Sync single watchlist item
      const result = await syncLabelForWatchlistItem(
        Number(watchlistItem.id),
        watchlistItem.title,
        ['action', 'drama'], // webhook tags
        {
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
          radarrManager: {} as RadarrManagerService,
          sonarrManager: {} as SonarrManagerService,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'remove',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
          extractContentGuidFromWebhook: vi.fn(),
          extractTagsFromWebhook: vi.fn(),
          queuePendingLabelSyncByWatchlistId:
            mockQueuePendingLabelSyncByWatchlistId,
          fetchTagsForWatchlistItem: vi.fn(),
        },
      )

      // Verify success
      expect(result).toBe(true)

      // Verify GUID resolution
      expect(mockSearchByGuid).toHaveBeenCalledWith(
        'plex://movie/test-key-single',
      )

      // Verify labels applied with webhook tags
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:action',
        'pulsarr:drama',
      ])

      await app.close()
    })

    it('should return false when watchlist item missing Plex key', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Create watchlist item without Plex key
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'No Key Movie',
          key: '', // Empty key (no Plex key available)
          status: 'pending',
        })
        .returning('*')

      const mockQueuePendingLabelSyncByWatchlistId = vi
        .fn()
        .mockResolvedValue(undefined)

      // Sync single watchlist item
      const result = await syncLabelForWatchlistItem(
        Number(watchlistItem.id),
        watchlistItem.title,
        [],
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
            enabled: true,
          } as PlexLabelSyncConfig,
          radarrManager: {} as RadarrManagerService,
          sonarrManager: {} as SonarrManagerService,
          fastify: app,
          labelPrefix: 'pulsarr',
          removedLabelPrefix: 'pulsarr:removed',
          removedLabelMode: 'remove',
          tagPrefix: 'pulsarr:user',
          removedTagPrefix: 'pulsarr:removed',
          extractContentGuidFromWebhook: vi.fn(),
          extractTagsFromWebhook: vi.fn(),
          queuePendingLabelSyncByWatchlistId:
            mockQueuePendingLabelSyncByWatchlistId,
          fetchTagsForWatchlistItem: vi.fn(),
        },
      )

      // Should return false
      expect(result).toBe(false)

      await app.close()
    })
  })
})
