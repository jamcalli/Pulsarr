import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import { queuePendingWebhook } from '@utils/webhook/pending-webhook.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('pending-webhook', () => {
  let mockFastify: FastifyInstance
  let mockCreatePendingWebhook: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCreatePendingWebhook = vi.fn().mockResolvedValue(undefined)

    mockFastify = {
      pendingWebhooks: {
        config: {
          maxAge: 10,
        },
      },
      db: {
        createPendingWebhook: mockCreatePendingWebhook,
      },
      log: createMockLogger(),
    } as unknown as FastifyInstance
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

      await queuePendingWebhook(mockFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

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

      // Allow 1 second tolerance for test execution time
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

      await queuePendingWebhook(mockFastify, {
        instanceType: 'sonarr',
        instanceId: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        mediaType: 'show',
        payload,
      })

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

      await queuePendingWebhook(mockFastify, {
        instanceType: 'radarr',
        instanceId: null,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_id: null,
        }),
      )
    })

    it('should use custom maxAge from config', async () => {
      const customFastify = {
        pendingWebhooks: {
          config: {
            maxAge: 30, // 30 minutes
          },
        },
        db: {
          createPendingWebhook: mockCreatePendingWebhook,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      await queuePendingWebhook(customFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 30 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (zero)', async () => {
      const invalidFastify = {
        pendingWebhooks: {
          config: {
            maxAge: 0,
          },
        },
        db: {
          createPendingWebhook: mockCreatePendingWebhook,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      await queuePendingWebhook(invalidFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (negative)', async () => {
      const invalidFastify = {
        pendingWebhooks: {
          config: {
            maxAge: -5,
          },
        },
        db: {
          createPendingWebhook: mockCreatePendingWebhook,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      await queuePendingWebhook(invalidFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes for invalid maxAge (NaN)', async () => {
      const invalidFastify = {
        pendingWebhooks: {
          config: {
            maxAge: 'invalid' as unknown as number,
          },
        },
        db: {
          createPendingWebhook: mockCreatePendingWebhook,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      await queuePendingWebhook(invalidFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      const call = mockCreatePendingWebhook.mock.calls[0][0]
      const expiresAt = call.expires_at as Date
      const expectedExpiry = now + 10 * 60_000

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000)
    })

    it('should fall back to 10 minutes when pendingWebhooks is undefined', async () => {
      const noConfigFastify = {
        db: {
          createPendingWebhook: mockCreatePendingWebhook,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const payload: WebhookPayload = {
        instanceName: 'Radarr',
        movie: {
          title: 'Test Movie',
          tmdbId: 12345,
        },
      }

      await queuePendingWebhook(noConfigFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

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

      await queuePendingWebhook(mockFastify, {
        instanceType: 'radarr',
        instanceId: 1,
        guid: 'tmdb:12345',
        title: 'Test Movie',
        mediaType: 'movie',
        payload,
      })

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
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

      // Should not throw
      await expect(
        queuePendingWebhook(mockFastify, {
          instanceType: 'radarr',
          instanceId: 1,
          guid: 'tmdb:12345',
          title: 'Test Movie',
          mediaType: 'movie',
          payload,
        }),
      ).resolves.toBeUndefined()

      expect(mockFastify.log.error).toHaveBeenCalledWith(
        {
          error: dbError,
          guid: 'tmdb:12345',
          title: 'Test Movie',
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

      await expect(
        queuePendingWebhook(mockFastify, {
          instanceType: 'sonarr',
          instanceId: 2,
          guid: 'tvdb:67890',
          title: 'Test Show',
          mediaType: 'show',
          payload,
        }),
      ).resolves.toBeUndefined()

      expect(mockFastify.log.error).toHaveBeenCalledWith(
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

      await queuePendingWebhook(mockFastify, {
        instanceType: 'sonarr',
        instanceId: 2,
        guid: 'tvdb:67890',
        title: 'Test Show',
        mediaType: 'show',
        payload,
      })

      expect(mockCreatePendingWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          payload,
        }),
      )
    })
  })
})
