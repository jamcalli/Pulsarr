import type { WebhookQueue } from '@root/types/webhook.types.js'
import {
  clearAllTimeouts,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
} from '@services/webhook-queue/batching/queue-manager.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('queue-manager', () => {
  let queue: WebhookQueue
  let deps: QueueManagerDeps

  beforeEach(() => {
    queue = {}
    deps = { logger: createMockLogger() }
  })

  afterEach(() => {
    for (const key in queue) {
      const show = queue[key]
      for (const season of Object.values(show.seasons)) {
        if (season.timeoutId) {
          clearTimeout(season.timeoutId)
        }
      }
      delete queue[key]
    }
  })

  describe('isEpisodeAlreadyQueued', () => {
    it('should return false when tvdbId is not in queue', () => {
      const result = isEpisodeAlreadyQueued('12345', 1, 1, queue)
      expect(result).toBe(false)
    })

    it('should return false when season is not in queue', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {},
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1, queue)
      expect(result).toBe(false)
    })

    it('should return false when season has no episodes', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1, queue)
      expect(result).toBe(false)
    })

    it('should return true when episode is already queued', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'Pilot',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1, queue)
      expect(result).toBe(true)
    })

    it('should return false when different episode is queued in same season', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 2,
                title: 'Episode 2',
                airDateUtc: '2024-01-08T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1, queue)
      expect(result).toBe(false)
    })

    it('should return true when episode is among multiple queued episodes', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'Episode 1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
              {
                seasonNumber: 1,
                episodeNumber: 2,
                title: 'Episode 2',
                airDateUtc: '2024-01-08T00:00:00Z',
              },
              {
                seasonNumber: 1,
                episodeNumber: 3,
                title: 'Episode 3',
                airDateUtc: '2024-01-15T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 2, queue)
      expect(result).toBe(true)
    })

    it('should check both season and episode numbers', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'S1E1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      expect(isEpisodeAlreadyQueued('12345', 1, 1, queue)).toBe(true)
      expect(isEpisodeAlreadyQueued('12345', 2, 1, queue)).toBe(false)
      expect(isEpisodeAlreadyQueued('12345', 1, 2, queue)).toBe(false)
    })

    it('should handle multiple shows in queue', () => {
      queue['12345'] = {
        title: 'Show 1',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'Episode 1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      queue['67890'] = {
        title: 'Show 2',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'Episode 1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      expect(isEpisodeAlreadyQueued('12345', 1, 1, queue)).toBe(true)
      expect(isEpisodeAlreadyQueued('67890', 1, 1, queue)).toBe(true)
      expect(isEpisodeAlreadyQueued('99999', 1, 1, queue)).toBe(false)
    })

    it('should handle multiple seasons in same show', () => {
      queue['12345'] = {
        title: 'Test Show',
        seasons: {
          1: {
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: 'S1E1',
                airDateUtc: '2024-01-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
          2: {
            episodes: [
              {
                seasonNumber: 2,
                episodeNumber: 1,
                title: 'S2E1',
                airDateUtc: '2024-06-01T00:00:00Z',
              },
            ],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: setTimeout(() => {}, 0),
            instanceId: null,
          },
        },
      }

      expect(isEpisodeAlreadyQueued('12345', 1, 1, queue)).toBe(true)
      expect(isEpisodeAlreadyQueued('12345', 2, 1, queue)).toBe(true)
      expect(isEpisodeAlreadyQueued('12345', 1, 2, queue)).toBe(false)
      expect(isEpisodeAlreadyQueued('12345', 3, 1, queue)).toBe(false)
    })
  })

  describe('clearAllTimeouts', () => {
    it('should clear all timeouts in the queue', () => {
      const timeout1 = setTimeout(() => {}, 10000)
      const timeout2 = setTimeout(() => {}, 10000)
      vi.spyOn(global, 'clearTimeout')

      queue['12345'] = {
        title: 'Show 1',
        seasons: {
          1: {
            episodes: [],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: timeout1,
            instanceId: null,
          },
        },
      }

      queue['67890'] = {
        title: 'Show 2',
        seasons: {
          1: {
            episodes: [],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            timeoutId: timeout2,
            instanceId: null,
          },
        },
      }

      clearAllTimeouts(queue, deps)

      expect(clearTimeout).toHaveBeenCalledWith(timeout1)
      expect(clearTimeout).toHaveBeenCalledWith(timeout2)
      expect(deps.logger.debug).toHaveBeenCalledTimes(2)
    })

    it('should handle empty queue', () => {
      clearAllTimeouts(queue, deps)

      expect(deps.logger.debug).not.toHaveBeenCalled()
    })

    it('should handle seasons without timeouts', () => {
      queue['12345'] = {
        title: 'Show 1',
        seasons: {
          1: {
            episodes: [],
            firstReceived: new Date(),
            lastUpdated: new Date(),
            notifiedSeasons: new Set(),
            instanceId: null,
          },
        },
      }

      clearAllTimeouts(queue, deps)

      expect(deps.logger.debug).not.toHaveBeenCalled()
    })
  })
})
