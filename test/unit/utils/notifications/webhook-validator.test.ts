import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import {
  clearWebhookCacheForTests,
  isWebhookProcessable,
} from '@utils/notifications/webhook-validator.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('webhook-validator', () => {
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
    clearWebhookCacheForTests()
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearWebhookCacheForTests()
  })

  describe('isWebhookProcessable', () => {
    describe('Test webhooks', () => {
      it('should return false for test webhooks', () => {
        const payload = {
          eventType: 'Test',
          instanceName: 'Sonarr',
        } as unknown as WebhookPayload

        const result = isWebhookProcessable(payload, mockLogger)

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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(true)
      })

      it('should return false for Sonarr upgrade event', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          isUpgrade: true,
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Skipping webhook - is an upgrade event',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          { eventType: 'Grab' },
          'Skipping webhook - not a Download event',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Skipping invalid Sonarr webhook - missing required fields',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Skipping invalid Sonarr webhook - missing required fields',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Skipping invalid Sonarr webhook - missing required fields',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

        expect(result).toBe(false)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Skipping webhook - no file information',
        )
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

        const result = isWebhookProcessable(payload, mockLogger)

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

        const result = isWebhookProcessable(payload, mockLogger)

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

        // First call should pass
        const firstResult = isWebhookProcessable(payload, mockLogger)
        expect(firstResult).toBe(true)

        // Second call with same payload should be detected as duplicate
        const secondResult = isWebhookProcessable(payload, mockLogger)
        expect(secondResult).toBe(false)
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            contentInfo: expect.stringContaining('Duplicate Test Show'),
          }),
          'Duplicate webhook detected within deduplication window',
        )
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

        // Both should pass because they're different episodes
        const result1 = isWebhookProcessable(payload1, mockLogger)
        const result2 = isWebhookProcessable(payload2, mockLogger)

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

        const result1 = isWebhookProcessable(payload1, mockLogger)
        const result2 = isWebhookProcessable(payload2, mockLogger)

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

        const result = isWebhookProcessable(payload)

        expect(result).toBe(true)
      })

      it('should skip upgrade without logger', () => {
        const payload = {
          eventType: 'Download',
          instanceName: 'Sonarr',
          isUpgrade: true,
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

        const result = isWebhookProcessable(payload)

        expect(result).toBe(false)
      })
    })
  })
})
