/**
 * Integration tests for label-applicator → content-tracker flow
 *
 * Tests the full label application and tracking update flow with real database
 * operations and mocked PlexServer. Verifies that the tracking table state
 * matches the expected state after single-item label application.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { applyLabelsToSingleItem } from '@services/plex-label-sync/label-operations/label-applicator.js'
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
import { SEED_USERS, seedAll } from '../../../helpers/seeds/index.js'

describe('Label Applicator → Content Tracker Integration', () => {
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

  describe('Basic label application with tracking', () => {
    it('should apply labels and create tracking records for single user', async () => {
      const knex = getTestDatabase()

      // Create watchlist item in database
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-001',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      // Apply labels
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify Plex labels were applied
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking record was created
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
      expect(JSON.parse(tracking[0].content_guids as string)).toEqual([
        'imdb:tt0063350',
        'tmdb:10331',
      ])
    })

    it('should apply labels and create tracking records for multiple users', async () => {
      const knex = getTestDatabase()

      // Create watchlist items for both users
      const watchlistItems = await knex('watchlist_items')
        .insert([
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
            type: 'movie',
            title: 'Test Movie',
            key: 'test-key-multi-user1',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
            type: 'movie',
            title: 'Test Movie',
            key: 'test-key-multi-user2',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItems[0].id,
        },
        {
          user_id: SEED_USERS[1].id,
          username: SEED_USERS[1].name,
          watchlist_id: watchlistItems[1].id,
        },
      ]

      // Apply labels
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify Plex labels for both users
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking records for both users
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)

      // User 1 tracking
      expect(tracking[0]).toMatchObject({
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
      })
      expect(JSON.parse(tracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-primary',
      ])

      // User 2 tracking
      expect(tracking[1]).toMatchObject({
        content_type: 'movie',
        user_id: SEED_USERS[1].id,
        plex_rating_key: '12345',
      })
      expect(JSON.parse(tracking[1].labels_applied as string)).toEqual([
        'pulsarr:test-user-discord-apprise',
      ])
    })

    it('should update existing tracking records when reapplying labels', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-update',
          status: 'grabbed',
        })
        .returning('*')

      // Create existing tracking record
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
      })

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:test-user-primary' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      // Apply labels again
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify tracking record still exists (updated, not duplicated)
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

  describe('Tag label tracking', () => {
    it('should track combined user and tag labels together', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-tag-single',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      const webhookTags = ['action', 'thriller']

      // Apply labels with tag sync enabled
      const result = await applyLabelsToSingleItem(
        '12345',
        users,
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
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
        },
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)

      // Verify Plex labels include user + tag labels
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:action',
        'pulsarr:thriller',
      ])

      // Verify tracking record includes both user and tag labels
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      const labelsApplied = JSON.parse(tracking[0].labels_applied as string)
      expect(labelsApplied).toHaveLength(3)
      expect(labelsApplied).toEqual(
        expect.arrayContaining([
          'pulsarr:test-user-primary',
          'pulsarr:action',
          'pulsarr:thriller',
        ]),
      )
    })

    it('should track tag labels separately for each user', async () => {
      const knex = getTestDatabase()

      // Create watchlist items for both users
      const watchlistItems = await knex('watchlist_items')
        .insert([
          {
            user_id: SEED_USERS[0].id,
            guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
            type: 'movie',
            title: 'Test Movie',
            key: 'test-key-tag-multi-user1',
            status: 'grabbed',
          },
          {
            user_id: SEED_USERS[1].id,
            guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
            type: 'movie',
            title: 'Test Movie',
            key: 'test-key-tag-multi-user2',
            status: 'grabbed',
          },
        ])
        .returning('*')

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItems[0].id,
        },
        {
          user_id: SEED_USERS[1].id,
          username: SEED_USERS[1].name,
          watchlist_id: watchlistItems[1].id,
        },
      ]

      const webhookTags = ['action', 'thriller']

      // Apply labels with tag sync
      const result = await applyLabelsToSingleItem(
        '12345',
        users,
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: {
            ...app.config.plexLabelSync,
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
        },
        webhookTags,
        'movie',
      )

      expect(result).toBe(true)

      // Verify tracking records for both users include tag labels
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)

      // User 1: user label + tag labels
      const user1Labels = JSON.parse(tracking[0].labels_applied as string)
      expect(user1Labels).toHaveLength(3)
      expect(user1Labels).toEqual(
        expect.arrayContaining([
          'pulsarr:test-user-primary',
          'pulsarr:action',
          'pulsarr:thriller',
        ]),
      )

      // User 2: user label + tag labels
      const user2Labels = JSON.parse(tracking[1].labels_applied as string)
      expect(user2Labels).toHaveLength(3)
      expect(user2Labels).toEqual(
        expect.arrayContaining([
          'pulsarr:test-user-discord-apprise',
          'pulsarr:action',
          'pulsarr:thriller',
        ]),
      )
    })
  })

  describe('Mode handling with tracking', () => {
    it('should preserve tracked labels in keep mode', async () => {
      const knex = getTestDatabase()

      // Create watchlist item for user2
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[1].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-keep-mode',
          status: 'grabbed',
        })
        .returning('*')

      // Create existing tracking record for user1
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
        content_type: 'movie',
        user_id: SEED_USERS[0].id,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
      })

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:test-user-primary' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[1].id,
          username: SEED_USERS[1].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      // Apply labels in KEEP mode
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'keep',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify user1's label is preserved in Plex
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking: user1 record preserved, user2 record added
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)
      expect(tracking[0].user_id).toBe(SEED_USERS[0].id)
      expect(tracking[1].user_id).toBe(SEED_USERS[1].id)
    })

    it('should remove obsolete labels in remove mode', async () => {
      const knex = getTestDatabase()

      // Create watchlist item for user2
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[1].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-remove-mode',
          status: 'grabbed',
        })
        .returning('*')

      // Mock PlexServer with user1's label (but user1 no longer wants content)
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:test-user-primary' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[1].id,
          username: SEED_USERS[1].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      // Apply labels in REMOVE mode (default)
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify user1's label is removed from Plex
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking: only user2 record exists
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
      })

      expect(tracking).toHaveLength(1)
      expect(tracking[0].user_id).toBe(SEED_USERS[1].id)
    })

    it('should clean up removed labels and tracking in special-label mode', async () => {
      const knex = getTestDatabase()

      // Create watchlist item
      const [watchlistItem] = await knex('watchlist_items')
        .insert({
          user_id: SEED_USERS[0].id,
          guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          type: 'movie',
          title: 'Test Movie',
          key: 'test-key-special-label',
          status: 'grabbed',
        })
        .returning('*')

      // Create system tracking record for removed label
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
        content_type: 'movie',
        user_id: null,
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:removed']),
      })

      // Mock PlexServer with removed label
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:removed' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: watchlistItem.id,
        },
      ]

      // Apply labels in SPECIAL-LABEL mode
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'special-label',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      expect(result).toBe(true)

      // Verify removed label is cleaned up
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking: user record should exist
      const userTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })
      expect(userTracking).toHaveLength(1)
      expect(JSON.parse(userTracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-primary',
      ])
    })
  })

  describe('Error handling', () => {
    it('should handle tracking errors gracefully', async () => {
      const knex = getTestDatabase()

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      const users = [
        {
          user_id: SEED_USERS[0].id,
          username: SEED_USERS[0].name,
          watchlist_id: 9999, // Invalid watchlist ID
        },
      ]

      // Apply labels (should succeed even if tracking fails)
      const result = await applyLabelsToSingleItem('12345', users, {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Should still succeed (labels applied to Plex)
      expect(result).toBe(true)
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking record uses fallback (ratingKey as GUID)
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })

      expect(tracking).toHaveLength(1)
      expect(JSON.parse(tracking[0].content_guids as string)).toEqual(['12345'])
    })
  })
})
