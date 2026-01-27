import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import {
  type PendingStoreDeps,
  type PendingWebhookParams,
  queuePendingWebhook,
} from '@services/webhook-queue/persistence/pending-store.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('pending-store', () => {
  let mockCreatePendingWebhook: ReturnType<typeof vi.fn>
  let deps: PendingStoreDeps

  beforeEach(() => {
    mockCreatePendingWebhook = vi.fn().mockResolvedValue(undefined)

    deps = {
      db: {
        createPendingWebhook: mockCreatePendingWebhook,
      } as unknown as PendingStoreDeps['db'],
      logger: createMockLogger(),
      maxAgeMinutes: 10,
    }
  })

  describe('queuePendingWebhook', () => {
    it('should queue a movie webhook with default expiry', async () => {
      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, deps)

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith({
        instance_type: 'radarr',
        instance_id: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        media_type: 'movie',
        payload,
        expires_at: expect.any(Date),
      })

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should queue a show webhook', async () => {
      const payload: WebhookPayload = {
        eventType: 'Download',
        instanceName: 'Sonarr',
        series: {
          title: 'Test Show',
          tvdbId: 67890,
        },
        episodes: [
          {
            episodeNumber: 1,
            seasonNumber: 1,
            title: 'Pilot',
            airDateUtc: '2024-01-01T00:00:00Z',
          },
        ],
        episodeFile: {
          id: 1,
          relativePath: '/path/to/episode.mkv',
          quality: 'WEBDL-1080p',
          qualityVersion: 1,
          size: 1000000,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'sonarr',
        instanceId: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        mediaType: 'show',
        payload,
      }

      await queuePendingWebhook(params, deps)

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith({
        instance_type: 'sonarr',
        instance_id: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        media_type: 'show',
        payload,
        expires_at: expect.any(Date),
      })
    })

    it('should handle null instanceId', async () => {
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: null,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, deps)

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_id: null,
        }),
      )
    })

    it('should use custom maxAge from deps', async () => {
      const customDeps: PendingStoreDeps = {
        ...deps,
        maxAgeMinutes: 30,
      }

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, customDeps)

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 30 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (zero)', async () => {
      const invalidDeps: PendingStoreDeps = {
        ...deps,
        maxAgeMinutes: 0,
      }

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, invalidDeps)

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (negative)', async () => {
      const invalidDeps: PendingStoreDeps = {
        ...deps,
        maxAgeMinutes: -5,
      }

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, invalidDeps)

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (NaN)', async () => {
      const invalidDeps: PendingStoreDeps = {
        ...deps,
        maxAgeMinutes: Number.NaN,
      }

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, invalidDeps)

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should log debug message on success', async () => {
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await queuePendingWebhook(params, deps)

      expect(deps.logger.debug).toHaveBeenCalledWith(
        {
          guid: 'tmdb:12345',
          instanceType: 'radarr',
          instanceId: 1,
          mediaType: 'movie',
          title: 'Test Movie',
          expiresAt: expect.any(String),
        },
        'Queued pending webhook (no matching items)',
      )
    })

    it('should log error but not throw on database failure', async () => {
      const dbError = new Error('Database connection failed')
      mockCreatePendingWebhook.mockRejectedValue(dbError)

      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      }

      await expect(queuePendingWebhook(params, deps)).resolves.toBeUndefined()

      expect(deps.logger.error).toHaveBeenCalledWith(
        {
          error: dbError,
          guid: 'tmdb:12345',
          title: 'Test Movie',
          instanceType: 'radarr',
          instanceId: 1,
        },
        'Failed to create pending webhook for movie, but returning success to prevent resends',
      )
    })

    it('should swallow errors for show media type', async () => {
      const dbError = new Error('Database connection failed')
      mockCreatePendingWebhook.mockRejectedValue(dbError)

      const payload: WebhookPayload = {
        eventType: 'Download',
        instanceName: 'Sonarr',
        series: {
          title: 'Test Show',
          tvdbId: 67890,
        },
        episodes: [
          {
            episodeNumber: 1,
            seasonNumber: 1,
            title: 'Pilot',
            airDateUtc: '2024-01-01T00:00:00Z',
          },
        ],
        episodeFile: {
          id: 1,
          relativePath: '/path/to/episode.mkv',
          quality: 'WEBDL-1080p',
          qualityVersion: 1,
          size: 1000000,
        },
      }

      const params: PendingWebhookParams = {
        instanceType: 'sonarr',
        instanceId: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        mediaType: 'show',
        payload,
      }

      await expect(queuePendingWebhook(params, deps)).resolves.toBeUndefined()

      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: dbError,
        }),
        'Failed to create pending webhook for show, but returning success to prevent resends',
      )
    })

    it('should handle bulk episode payload', async () => {
      const payload: WebhookPayload = {
        eventType: 'Download',
        instanceName: 'Sonarr',
        series: {
          title: 'Test Show',
          tvdbId: 67890,
        },
        episodes: [
          {
            episodeNumber: 1,
            seasonNumber: 1,
            title: 'Episode 1',
            airDateUtc: '2024-01-01T00:00:00Z',
          },
          {
            episodeNumber: 2,
            seasonNumber: 1,
            title: 'Episode 2',
            airDateUtc: '2024-01-08T00:00:00Z',
          },
        ],
        episodeFiles: [
          {
            id: 1,
            relativePath: '/path/to/episode1.mkv',
            quality: 'WEBDL-1080p',
            qualityVersion: 1,
            size: 1000000,
          },
          {
            id: 2,
            relativePath: '/path/to/episode2.mkv',
            quality: 'WEBDL-1080p',
            qualityVersion: 1,
            size: 1000000,
          },
        ],
        release: {
          releaseType: 'bulk',
        },
        fileCount: 2,
      }

      const params: PendingWebhookParams = {
        instanceType: 'sonarr',
        instanceId: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        mediaType: 'show',
        payload,
      }

      await queuePendingWebhook(params, deps)

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          payload,
        }),
      )
    })
  })
})
