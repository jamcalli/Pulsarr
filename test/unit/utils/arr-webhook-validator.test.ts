import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  createWebhookDedupeCache,
  isWebhookProcessable,
  WEBHOOK_CACHE_TTL_MS,
  type WebhookDedupeCache,
} from '@utils/arr-webhook-validator.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('arr-webhook-validator', () => {
  const mockLogger = createMockLogger()

  let now: number
  let cache: WebhookDedupeCache

  beforeEach(() => {
    now = 1
    cache = createWebhookDedupeCache(new CacheRegistry({ now: () => now }))
  })

  describe('isWebhookProcessable', () => {
    describe('Test webhooks', () => {
      it('should return false for test webhooks', () => {
        const payload = {
          eventType: 'Test',
          instanceName: 'Sonarr',
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })
    })

    describe('Sonarr webhooks', () => {
      it('should return true for valid Sonarr download webhook', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show Unique 1',
            tvdbId: 99991,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(true)
      })

      it('should return false for non-Download event type', () => {
        const payload = {
          eventType: 'Grab',
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show',
            tvdbId: 12345,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })

      it('should return false when missing series field', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })

      it('should return false when missing episodes field', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show',
            tvdbId: 12345,
          },
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })

      it('should return false when missing eventType field', () => {
        const payload = {
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show',
            tvdbId: 12345,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })

      it('should return false when missing file information', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show',
            tvdbId: 12345,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(false)
      })

      it('should accept episodeFiles instead of episodeFile', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Show With Multiple Files',
            tvdbId: 99992,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFiles: [
            {
              id: 1,
              path: '/media/shows/Test Show/Season 1/S01E01.mkv',
            },
          ],
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(true)
      })
    })

    describe('Radarr webhooks', () => {
      it('should return true for valid Radarr webhook', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: {
            title: 'Unique Test Movie',
            tmdbId: 99993,
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache, mockLogger)

        expect(result).toBe(true)
      })
    })

    describe('Duplicate detection', () => {
      it('should return false for duplicate webhooks within TTL window', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Duplicate Test Show',
            tvdbId: 88881,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const firstResult = isWebhookProcessable(payload, cache, mockLogger)
        expect(firstResult).toBe(true)

        const secondResult = isWebhookProcessable(payload, cache, mockLogger)
        expect(secondResult).toBe(false)
      })

      it('measures the window from the first webhook and allows one after it', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: { title: 'Window Movie', tmdbId: 88885 },
        } as unknown as WebhookPayload

        expect(isWebhookProcessable(payload, cache, mockLogger)).toBe(true)
        now += WEBHOOK_CACHE_TTL_MS / 2
        expect(isWebhookProcessable(payload, cache, mockLogger)).toBe(false)
        now += WEBHOOK_CACHE_TTL_MS / 2
        expect(isWebhookProcessable(payload, cache, mockLogger)).toBe(false)
        now += 1
        expect(isWebhookProcessable(payload, cache, mockLogger)).toBe(true)
      })

      it('allows a webhook again once the registry is cleared', () => {
        const registry = new CacheRegistry()
        const cleared = createWebhookDedupeCache(registry)
        const payload = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: { title: 'Cleared Movie', tmdbId: 88886 },
        } as unknown as WebhookPayload

        expect(isWebhookProcessable(payload, cleared, mockLogger)).toBe(true)
        registry.clear()
        expect(isWebhookProcessable(payload, cleared, mockLogger)).toBe(true)
      })

      it('should generate different hashes for different episodes', () => {
        const payload1 = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Different Episodes Show',
            tvdbId: 88882,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Pilot',
            },
          ],
          episodeFile: {
            id: 1,
            path: '/media/shows/Test Show/Season 1/S01E01.mkv',
          },
        } as unknown as WebhookPayload

        const payload2 = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Different Episodes Show',
            tvdbId: 88882,
          },
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 2,
              title: 'Episode 2',
            },
          ],
          episodeFile: {
            id: 2,
            path: '/media/shows/Test Show/Season 1/S01E02.mkv',
          },
        } as unknown as WebhookPayload

        const result1 = isWebhookProcessable(payload1, cache, mockLogger)
        const result2 = isWebhookProcessable(payload2, cache, mockLogger)

        expect(result1).toBe(true)
        expect(result2).toBe(true)
      })

      it('should generate different hashes for different movies', () => {
        const payload1 = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: {
            title: 'Movie 1',
            tmdbId: 111,
          },
        } as unknown as WebhookPayload

        const payload2 = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: {
            title: 'Movie 2',
            tmdbId: 222,
          },
        } as unknown as WebhookPayload

        const result1 = isWebhookProcessable(payload1, cache, mockLogger)
        const result2 = isWebhookProcessable(payload2, cache, mockLogger)

        expect(result1).toBe(true)
        expect(result2).toBe(true)
      })
    })

    describe('Without logger', () => {
      it('should work without logger parameter', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Radarr',
          movie: {
            title: 'No Logger Movie',
            tmdbId: 88884,
          },
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, cache)

        expect(result).toBe(true)
      })
    })
  })
})
