/**
 * Integration tests for label-reconciler → content-tracker flow
 *
 * Tests the full reconciliation and tracking update flow with real database
 * operations and mocked PlexServer. Verifies that the tracking table state
 * matches the expected state after label reconciliation.
 */

import type {
  ContentWithUsers,
  PlexContentItems,
} from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { reconcileLabelsForContent } from '@services/plex-label-sync/label-operations/label-reconciler.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../../helpers/database.js'
import { SEED_USERS, seedAll } from '../../../helpers/seeds/index.js'

describe('Label Reconciler → Content Tracker Integration', () => {
  beforeEach(async () => {
    await initializeTestDatabase()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('Basic reconciliation in remove mode', () => {
    it('should reconcile labels and update tracking table', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Mock PlexServer to return current labels and allow updates
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Current labels: pulsarr:user1
      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:user1' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      // Replace PlexServerService methods
      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Create content with two users
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[0].id,
            username: SEED_USERS[0].name,
            watchlist_id: 1,
          },
          {
            user_id: SEED_USERS[1].id,
            username: SEED_USERS[1].name,
            watchlist_id: 2,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation
      const result = await reconcileLabelsForContent(
        plexItems,
        [], // no radarr movies
        [], // no sonarr series
        {
          plexServer: app.plexServerService,
          db: app.db,
          logger: app.log,
          config: app.config.plexLabelSync as PlexLabelSyncConfig,
          removedLabelMode: 'remove',
          removedLabelPrefix: 'pulsarr:removed',
          tagPrefix: 'pulsarr',
          removedTagPrefix: 'pulsarr:removed',
        },
      )

      expect(result.success).toBe(true)

      // Verify Plex labels were updated
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking table was updated
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(2)

      // User 1 tracking record
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

      // User 2 tracking record
      expect(tracking[1]).toMatchObject({
        content_type: 'movie',
        user_id: SEED_USERS[1].id,
        plex_rating_key: '12345',
      })
      expect(JSON.parse(tracking[1].labels_applied as string)).toEqual([
        'pulsarr:test-user-discord-apprise',
      ])
    })

    it('should remove obsolete tracking records when user is removed', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Setup: Create initial tracking records for two users
      await knex('plex_label_tracking').insert([
        {
          content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
      ])

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:user1' }, { tag: 'pulsarr:user2' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Content now has only user1 (user2 removed)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[0].id,
            username: SEED_USERS[0].name,
            watchlist_id: 1,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels updated to remove user2
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking table: user2 record should be removed
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
      })

      expect(tracking).toHaveLength(1)
      expect(tracking[0].user_id).toBe(SEED_USERS[0].id)
    })
  })

  describe('Reconciliation in keep mode', () => {
    it('should preserve existing labels and add new ones', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Current labels: pulsarr:user1, some-other-label
      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [
          { tag: 'pulsarr:test-user-primary' },
          { tag: 'some-other-label' },
        ],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Content with user2 (user1 removed from watchlist)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[1].id,
            username: SEED_USERS[1].name,
            watchlist_id: 2,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation in KEEP mode
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'keep',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels: should keep pulsarr:user1 AND add pulsarr:user2
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
        'some-other-label',
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking table has user2 record
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[1].id,
      })

      expect(tracking).toHaveLength(1)
      expect(JSON.parse(tracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-discord-apprise',
      ])
    })
  })

  describe('Reconciliation in special-label mode', () => {
    it('should add removed label when no users exist', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Current labels: pulsarr:user1
      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [{ tag: 'pulsarr:user1' }],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Content with NO users (all removed)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation in SPECIAL-LABEL mode
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'special-label',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels: should have ONLY the removed label
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:removed',
      ])

      // Verify tracking table has system record (user_id = null)
      const tracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: null,
      })

      expect(tracking).toHaveLength(1)
      expect(JSON.parse(tracking[0].labels_applied as string)).toEqual([
        'pulsarr:removed',
      ])
    })

    it('should remove special label when users re-add content', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Setup: Create system tracking record for removed label
      await knex('plex_label_tracking').insert({
        content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
        content_type: 'movie',
        user_id: null, // System record
        plex_rating_key: '12345',
        labels_applied: JSON.stringify(['pulsarr:removed']),
      })

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Current labels: pulsarr:removed
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

      // Content now has user1 (re-added to watchlist)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[0].id,
            username: SEED_USERS[0].name,
            watchlist_id: 1,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation in SPECIAL-LABEL mode
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'special-label',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels: removed label should be cleaned up
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking table: system record should be removed, user record added
      const systemTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: null,
      })
      expect(systemTracking).toHaveLength(0)

      const userTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: SEED_USERS[0].id,
      })
      expect(userTracking).toHaveLength(1)
      expect(JSON.parse(userTracking[0].labels_applied as string)).toEqual([
        'pulsarr:test-user-primary',
      ])
    })

    it('should handle multi-user special-label scenario', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Setup: Create tracking records for two users
      await knex('plex_label_tracking').insert([
        {
          content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          content_type: 'movie',
          user_id: SEED_USERS[0].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-primary']),
        },
        {
          content_guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331']),
          content_type: 'movie',
          user_id: SEED_USERS[1].id,
          plex_rating_key: '12345',
          labels_applied: JSON.stringify(['pulsarr:test-user-discord-apprise']),
        },
      ])

      // Mock PlexServer
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      // Current labels: both users
      mockGetMetadata.mockResolvedValue({
        ratingKey: '12345',
        key: '/library/metadata/12345',
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [
          { tag: 'pulsarr:test-user-primary' },
          { tag: 'pulsarr:test-user-discord-apprise' },
        ],
      })
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Content now has only user2 (user1 removed)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[1].id,
            username: SEED_USERS[1].name,
            watchlist_id: 2,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie',
          },
        ],
      }

      // Execute reconciliation in SPECIAL-LABEL mode
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'special-label',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify Plex labels: user1 removed, user2 preserved, NO removed label
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-discord-apprise',
      ])

      // Verify tracking table: user1 record removed, user2 record preserved
      const tracking = await knex('plex_label_tracking')
        .where({ plex_rating_key: '12345' })
        .orderBy('user_id')

      expect(tracking).toHaveLength(1)
      expect(tracking[0].user_id).toBe(SEED_USERS[1].id)

      // No system record should exist (still has active users)
      const systemTracking = await knex('plex_label_tracking').where({
        plex_rating_key: '12345',
        user_id: null,
      })
      expect(systemTracking).toHaveLength(0)
    })
  })

  describe('Multiple Plex items (editions)', () => {
    it('should handle multiple editions with separate tracking records', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const knex = getTestDatabase()

      // Mock PlexServer for two editions
      const mockGetMetadata = vi.fn()
      const mockUpdateLabels = vi.fn()

      mockGetMetadata.mockImplementation(async (ratingKey: string) => ({
        ratingKey,
        key: `/library/metadata/${ratingKey}`,
        guid: 'plex://movie/test',
        type: 'movie',
        title: 'Test Movie',
        Label: [],
      }))
      mockUpdateLabels.mockResolvedValue(true)

      app.plexServerService.getMetadata = mockGetMetadata
      app.plexServerService.updateLabels = mockUpdateLabels

      // Content with one user, two Plex items (editions)
      const content: ContentWithUsers = {
        primaryGuid: 'imdb:tt0063350',
        allGuids: ['imdb:tt0063350', 'tmdb:10331'],
        type: 'movie',
        title: 'Test Movie',
        plexKey: null,
        users: [
          {
            user_id: SEED_USERS[0].id,
            username: SEED_USERS[0].name,
            watchlist_id: 1,
          },
        ],
      }

      const plexItems: PlexContentItems = {
        content,
        plexItems: [
          {
            ratingKey: '12345',
            title: 'Test Movie (HD)',
          },
          {
            ratingKey: '12346',
            title: 'Test Movie (4K)',
          },
        ],
      }

      // Execute reconciliation
      await reconcileLabelsForContent(plexItems, [], [], {
        plexServer: app.plexServerService,
        db: app.db,
        logger: app.log,
        config: app.config.plexLabelSync as PlexLabelSyncConfig,
        removedLabelMode: 'remove',
        removedLabelPrefix: 'pulsarr:removed',
        tagPrefix: 'pulsarr',
        removedTagPrefix: 'pulsarr:removed',
      })

      // Verify both editions were updated
      expect(mockUpdateLabels).toHaveBeenCalledTimes(2)
      expect(mockUpdateLabels).toHaveBeenCalledWith('12345', [
        'pulsarr:test-user-primary',
      ])
      expect(mockUpdateLabels).toHaveBeenCalledWith('12346', [
        'pulsarr:test-user-primary',
      ])

      // Verify tracking table has separate records for each edition
      const tracking = await knex('plex_label_tracking')
        .where({ user_id: SEED_USERS[0].id })
        .orderBy('plex_rating_key')

      expect(tracking).toHaveLength(2)
      expect(tracking[0].plex_rating_key).toBe('12345')
      expect(tracking[1].plex_rating_key).toBe('12346')
    })
  })
})
