import { processContentNotifications } from '@root/utils/notifications/index.js'
import { processQueuedWebhooks } from '@utils/webhook/queue-processor.js'
import { webhookQueue } from '@utils/webhook/queue-state.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

vi.mock('@root/utils/notifications/index.js', () => ({
  processContentNotifications: vi.fn(),
}))

vi.mock('@utils/webhook/pending-webhook.js', () => ({
  queuePendingWebhook: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@utils/webhook/episode-checker.js', () => ({
  isRecentEpisode: vi.fn(),
}))

describe('queue-processor', () => {
  let mockFastify: FastifyInstance
  const mockProcessContentNotifications = vi.mocked(processContentNotifications)

  beforeEach(() => {
    mockFastify = {
      config: {
        newEpisodeThreshold: 7 * 24 * 60 * 60 * 1000,
      },
      log: createMockLogger(),
    } as unknown as FastifyInstance

    mockProcessContentNotifications.mockResolvedValue({
      matchedCount: 1,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    for (const key in webhookQueue) {
      delete webhookQueue[key]
    }
  })

  describe('processQueuedWebhooks', () => {
    it('should log warning and return when queue does not exist', async () => {
      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        { tvdbId: '12345', seasonNumber: 1 },
        'Attempted to process non-existent queue',
      )
      expect(mockProcessContentNotifications).not.toHaveBeenCalled()
    })

    it('should log warning and cleanup when season queue does not exist', async () => {
      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {},
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        { tvdbId: '12345', seasonNumber: 1 },
        'Attempted to process non-existent queue',
      )
    })

    it('should cleanup and return when episodes array is empty', async () => {
      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        { tvdbId: '12345', seasonNumber: 1 },
        'Queue has no episodes to process',
      )
      expect(webhookQueue['12345']).toBeUndefined()
    })

    it('should clear timeout when processing queue', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const timeout = setTimeout(() => {}, 10000)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Pilot',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: timeout,
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout)
    })

    it('should skip processing if season already notified and no recent episodes', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(false)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Old Episode',
                airDateUtc: '2020-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set([1]),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.info).toHaveBeenCalledWith(
        { tvdbId: '12345', seasonNumber: 1 },
        'Season already notified and no recent episodes, clearing queue',
      )
      expect(mockProcessContentNotifications).not.toHaveBeenCalled()
      expect(webhookQueue['12345']).toBeUndefined()
    })

    it('should process season if already notified but has recent episodes', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Recent Episode',
                airDateUtc: new Date().toISOString(),
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set([1]),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockProcessContentNotifications).toHaveBeenCalled()
    })

    it('should mark season as notified', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode',
                airDateUtc: new Date().toISOString(),
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      const notifiedSeasons = webhookQueue['12345'].seasons[1].notifiedSeasons

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(notifiedSeasons.has(1)).toBe(true)
    })

    it('should process notifications for single episode', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Pilot',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: 123,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockProcessContentNotifications).toHaveBeenCalledWith(
        mockFastify,
        {
          type: 'show',
          guid: 'tvdb:12345',
          title: 'Test Show',
          episodes: [
            {
              episodeNumber: 1,
              seasonNumber: 1,
              title: 'Pilot',
              airDateUtc: '2024-01-01T00:00:00Z',
            },
          ],
        },
        false, // isBulkRelease
        {
          logger: mockFastify.log,
          instanceId: 123,
          instanceType: 'sonarr',
        },
      )
    })

    it('should process notifications for bulk release', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
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
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockProcessContentNotifications).toHaveBeenCalledWith(
        mockFastify,
        expect.objectContaining({
          episodes: expect.arrayContaining([
            expect.objectContaining({ episodeNumber: 1 }),
            expect.objectContaining({ episodeNumber: 2 }),
          ]),
        }),
        true, // isBulkRelease
        expect.anything(),
      )
    })

    it('should queue pending webhook when no matches found', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      const { queuePendingWebhook } = await import(
        '@utils/webhook/pending-webhook.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)
      mockProcessContentNotifications.mockResolvedValue({
        matchedCount: 0,
      })

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode 1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: 456,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(queuePendingWebhook).toHaveBeenCalledWith(mockFastify, {
        instanceType: 'sonarr',
        instanceId: 456,
        guid: 'tvdb:12345',
        title: 'Test Show',
        mediaType: 'show',
        payload: expect.objectContaining({
          eventType: 'Download',
          instanceName: 'Sonarr',
          series: {
            title: 'Test Show',
            tvdbId: 12345,
          },
        }),
      })

      expect(mockFastify.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tvdbId: '12345',
          seasonNumber: 1,
          matchedCount: 0,
        }),
        'No watchlist matches found, queued to pending webhooks',
      )
    })

    it('should not queue pending webhook when matches found', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      const { queuePendingWebhook } = await import(
        '@utils/webhook/pending-webhook.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)
      mockProcessContentNotifications.mockResolvedValue({
        matchedCount: 2,
      })

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode 1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(queuePendingWebhook).not.toHaveBeenCalled()
      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedCount: 2,
        }),
        'Watchlist matches found, notifications processed',
      )
    })

    it('should cleanup season queue after processing', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
          2: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 2,
                title: 'S2E1',
                airDateUtc: '2024-06-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      // Season 1 should be removed, but show still exists because season 2 remains
      expect(webhookQueue['12345']).toBeDefined()
      expect(webhookQueue['12345'].seasons[1]).toBeUndefined()
      expect(webhookQueue['12345'].seasons[2]).toBeDefined()
    })

    it('should remove show from queue when all seasons processed', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(webhookQueue['12345']).toBeUndefined()
      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        { tvdbId: '12345' },
        'Removed empty queue',
      )
    })

    it('should keep show in queue if other seasons exist', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'S1E1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
          2: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 2,
                title: 'S2E1',
                airDateUtc: '2024-06-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(webhookQueue['12345']).toBeDefined()
      expect(webhookQueue['12345'].seasons[1]).toBeUndefined()
      expect(webhookQueue['12345'].seasons[2]).toBeDefined()
    })

    it('should handle errors gracefully during processing', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)
      const error = new Error('Processing failed')
      mockProcessContentNotifications.mockRejectedValue(error)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.error).toHaveBeenCalledWith(
        { error, tvdbId: '12345', seasonNumber: 1 },
        'Error processing notifications from queue',
      )
      // Should still cleanup
      expect(webhookQueue['12345']).toBeUndefined()
    })

    it('should log processing information', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Breaking Bad',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Pilot',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
              {
                episodeNumber: 2,
                seasonNumber: 1,
                title: 'Episode 2',
                airDateUtc: '2024-01-08T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockFastify.log.info).toHaveBeenCalledWith(
        'Processing queued webhooks: Breaking Bad S1 (2 episodes)',
      )

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        {
          tvdbId: '12345',
          seasonNumber: 1,
          episodeCount: 2,
          isBulkRelease: true,
          title: 'Breaking Bad',
        },
        'Queued webhooks processing details',
      )
    })

    it('should handle null instanceId', async () => {
      const { isRecentEpisode } = await import(
        '@utils/webhook/episode-checker.js'
      )
      vi.mocked(isRecentEpisode).mockReturnValue(true)

      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                episodeNumber: 1,
                seasonNumber: 1,
                title: 'Episode',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      await processQueuedWebhooks('12345', 1, mockFastify)

      expect(mockProcessContentNotifications).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          instanceId: undefined,
        }),
      )
    })
  })
})
