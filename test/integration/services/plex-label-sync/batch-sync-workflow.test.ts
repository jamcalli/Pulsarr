/**
 * Integration tests for batch synchronization workflow
 *
 * Tests the full batch sync orchestration including content grouping, resolution,
 * reconciliation, and tracking with real database operations and mocked Plex.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { syncAllLabels } from '@services/plex-label-sync/orchestration/batch-sync.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
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
import { getTestDatabase, resetDatabase } from '../../../helpers/database.js'
import {
  SEED_USERS,
  SEED_WATCHLIST_ITEMS,
  seedAll,
} from '../../../helpers/seeds/index.js'

describe('Batch Sync → Full Workflow Integration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
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

  describe('Full sync workflow', () => {
    it('should sync labels for single user with single content item', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'The Shawshank Redemption',
        key: 'test-key-batch-1',
        status: 'grabbed',
      })

      // Mock PlexServer
      const mockSearchByGuid = vi.fn()
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Return results only for test Plex GUID, empty for seed data
      mockSearchByGuid.mockImplementation((guid: string) => {
        if (guid === 'plex://movie/test-key-batch-1') {
          return Promise.resolve([
            {
              ratingKey: '12345',
              title: 'The Shawshank Redemption',
              type: 'movie',
            },
          ])
        }
        return Promise.resolve([])
      })

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'The Shawshank Redemption',
        Label: [],
      })

      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Mock Radarr/Sonarr managers (no tag sync)
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      // Mock resetLabels and cleanupOrphanedPlexLabels
      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: false,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify result
      // 1 test item processed, seed items queued as pending (not found in Plex)
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(SEED_WATCHLIST_ITEMS.length)

      // Verify Plex API calls
      expect(mockSearchByGuid).toHaveBeenCalledWith(
        'plex://movie/test-key-batch-1',
      )
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking record created
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      expect(tracking[0]).toMatchObject({
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
      })
      expect(JSON.parse(tracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-primary',
      ])
    })

    it('should sync labels for multiple users on same content', async () => {
      const knex = getTestDatabase()

      // Create watchlist items for both users (same content)
      await knex('watchlist_items').insert([
        {
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-batch-multi-1',
          status: 'grabbed',
        },
        {
          user_id: SEED_USERS[1].id,
          guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
          type: 'movie',
          title: 'The Shawshank Redemption',
          key: 'test-key-batch-multi-2',
          status: 'grabbed',
        },
      ])

      // Mock PlexServer
      const mockSearchByGuid = vi.fn()
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Return results only for test Plex GUIDs, empty for seed data
      mockSearchByGuid.mockImplementation((guid: string) => {
        if (
          guid === 'plex://movie/test-key-batch-multi-1' ||
          guid === 'plex://movie/test-key-batch-multi-2'
        ) {
          return Promise.resolve([
            {
              ratingKey: '12345',
              title: 'The Shawshank Redemption',
              type: 'movie',
            },
          ])
        }
        return Promise.resolve([])
      })

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'The Shawshank Redemption',
        Label: [],
      })

      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.searchByGuid = mockSearchByGuid
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: false,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify result - content-centric approach processes 1 unique content
      // 1 unique content processed (2 users), seed items queued as pending
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(SEED_WATCHLIST_ITEMS.length)

      // Verify both user labels applied in single API call
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking records for both users
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)
      expect(tracking[0].user_id).toBe(SEED_USERS[0].id)
      expect(tracking[1].user_id).toBe(SEED_USERS[1].id)
    })

    it('should queue unavailable content for pending sync', async () => {
      const knex = getTestDatabase()

      // Create watchlist item and get its ID
      const [insertedRow] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt9999999', 'tmdb:9999999']),
          type: 'movie',
          title: 'Not In Plex Yet',
          key: 'test-key-unavailable',
          status: 'grabbed',
        })
        .returning('id')
      const insertedId = insertedRow.id

      // Mock PlexServer - content not found
      const mockSearchByGuid = vi.fn().mockResolvedValue([])

      app.plexServerService.searchByGuid = mockSearchByGuid

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: false,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Content not available, should be queued
      // 1 test item + seed items all queued as pending
      expect(result.processed).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.pending).toBe(SEED_WATCHLIST_ITEMS.length + 1)

      // Verify pending sync record created for the newly inserted item
      const pendingSyncs = await knex('pending_label_syncs').where({
        watchlist_item_id: insertedId,
      })

      expect(pendingSyncs.length).toBeGreaterThan(0)
    })
  })

  describe('Auto-reset functionality', () => {
    it('should call resetLabels when autoResetOnScheduledSync is enabled', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-reset',
        status: 'grabbed',
      })

      // Mock PlexServer
      const mockSearchByGuid = vi.fn()

      // Return results only for test Plex GUID, empty for seed data
      mockSearchByGuid.mockImplementation((guid: string) => {
        if (guid === 'plex://movie/test-key-reset') {
          return Promise.resolve([
            {
              ratingKey: '12345',
              title: 'Test Movie',
              type: 'movie',
            },
          ])
        }
        return Promise.resolve([])
      })

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

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 10,
        updated: 5,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync with auto-reset enabled
      await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: true,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify resetLabels was called
      expect(mockResetLabels).toHaveBeenCalledTimes(1)
    })

    it('should continue sync even if resetLabels fails', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-reset-fail',
        status: 'grabbed',
      })

      // Mock PlexServer
      const mockSearchByGuid = vi.fn()

      // Return results only for test Plex GUID, empty for seed data
      mockSearchByGuid.mockImplementation((guid: string) => {
        if (guid === 'plex://movie/test-key-reset-fail') {
          return Promise.resolve([
            {
              ratingKey: '12345',
              title: 'Test Movie',
              type: 'movie',
            },
          ])
        }
        return Promise.resolve([])
      })

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

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi
        .fn()
        .mockRejectedValue(new Error('Reset failed'))

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync - should not throw
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: true,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify sync continued despite reset failure
      expect(result.processed).toBe(1)
      expect(result.updated).toBe(1)
    })
  })

  describe('Orphaned label cleanup', () => {
    it('should call cleanupOrphanedPlexLabels when enabled', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      await knex('watchlist_items').insert({
        user_id: SEED_USERS[0].id,
        guids: JSON.stringify(['imdb:tt0111161', 'tmdb:278']),
        type: 'movie',
        title: 'Test Movie',
        key: 'test-key-cleanup',
        status: 'grabbed',
      })

      // Mock PlexServer
      const mockSearchByGuid = vi.fn()

      // Return results only for test Plex GUID, empty for seed data
      mockSearchByGuid.mockImplementation((guid: string) => {
        if (guid === 'plex://movie/test-key-cleanup') {
          return Promise.resolve([
            {
              ratingKey: '12345',
              title: 'Test Movie',
              type: 'movie',
            },
          ])
        }
        return Promise.resolve([])
      })

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

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 3,
        failed: 0,
      })

      // Run batch sync with cleanup enabled
      await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: false,
          cleanupOrphanedLabels: true,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify cleanup was called
      expect(mockCleanupOrphanedPlexLabels).toHaveBeenCalledTimes(1)
      expect(mockCleanupOrphanedPlexLabels).toHaveBeenCalledWith([], [])
    })
  })

  describe('Edge cases', () => {
    it('should skip sync when disabled', async () => {
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

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn()
      const mockCleanupOrphanedPlexLabels = vi.fn()

      // Run batch sync with sync disabled
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: false,
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify no processing occurred
      expect(result.processed).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.failed).toBe(0)
      expect(mockResetLabels).not.toHaveBeenCalled()
      expect(mockCleanupOrphanedPlexLabels).not.toHaveBeenCalled()
    })

    it('should handle empty watchlist gracefully', async () => {
      const knex = getTestDatabase()

      // Delete all watchlist items to test empty watchlist scenario
      await knex('watchlist_items').delete()

      // Mock PlexServer methods (even though not used with empty watchlist)
      const mockSearchByGuid = vi.fn()
      app.plexServerService.searchByGuid = mockSearchByGuid

      // Mock managers
      const mockRadarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as RadarrManagerService

      const mockSonarrManager = {
        getAllInstances: vi.fn().mockResolvedValue([]),
      } as unknown as SonarrManagerService

      const mockResetLabels = vi.fn().mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      })

      const mockCleanupOrphanedPlexLabels = vi.fn().mockResolvedValue({
        removed: 0,
        failed: 0,
      })

      // Run batch sync
      const result = await syncAllLabels({
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: {
          ...app.config.plexLabelSync,
          enabled: true,
          autoResetOnScheduledSync: false,
          cleanupOrphanedLabels: false,
          tagSync: {
            enabled: false,
            syncRadarrTags: false,
            syncSonarrTags: false,
          },
        } as PlexLabelSyncConfig,
        radarrManager: mockRadarrManager,
        sonarrManager: mockSonarrManager,
        fastify: app,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        resetLabels: mockResetLabels,
        cleanupOrphanedPlexLabels: mockCleanupOrphanedPlexLabels,
      })

      // Verify graceful handling
      expect(result.processed).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.failed).toBe(0)
    })
  })
})
