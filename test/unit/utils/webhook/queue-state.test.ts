import {
  isEpisodeAlreadyQueued,
  webhookQueue,
} from '@utils/webhook/queue-state.js'
import { afterEach, describe, expect, it } from 'vitest'

describe('queue-state', () => {
  afterEach(() => {
    // Clean up the queue after each test
    for (const key in webhookQueue) {
      delete webhookQueue[key]
    }
  })

  describe('isEpisodeAlreadyQueued', () => {
    it('should return false when tvdbId is not in queue', () => {
      const result = isEpisodeAlreadyQueued('12345', 1, 1)
      expect(result).toBe(false)
    })

    it('should return false when season is not in queue', () => {
      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {},
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1)
      expect(result).toBe(false)
    })

    it('should return false when season has no episodes', () => {
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

      const result = isEpisodeAlreadyQueued('12345', 1, 1)
      expect(result).toBe(false)
    })

    it('should return true when episode is already queued', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1)
      expect(result).toBe(true)
    })

    it('should return false when different episode is queued in same season', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 1)
      expect(result).toBe(false)
    })

    it('should return true when episode is among multiple queued episodes', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      const result = isEpisodeAlreadyQueued('12345', 1, 2)
      expect(result).toBe(true)
    })

    it('should check both season and episode numbers', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      // Episode data has seasonNumber: 1, episodeNumber: 1
      // Should match when querying for S1E1
      expect(isEpisodeAlreadyQueued('12345', 1, 1)).toBe(true)

      // Should not match when querying for S2E1 (different season)
      expect(isEpisodeAlreadyQueued('12345', 2, 1)).toBe(false)

      // Should not match when querying for S1E2 (different episode)
      expect(isEpisodeAlreadyQueued('12345', 1, 2)).toBe(false)
    })

    it('should handle multiple shows in queue', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      webhookQueue['67890'] = {
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      expect(isEpisodeAlreadyQueued('12345', 1, 1)).toBe(true)
      expect(isEpisodeAlreadyQueued('67890', 1, 1)).toBe(true)
      expect(isEpisodeAlreadyQueued('99999', 1, 1)).toBe(false)
    })

    it('should handle multiple seasons in same show', () => {
      webhookQueue['12345'] = {
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
            upgradeTracker: new Map(),
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
            upgradeTracker: new Map(),
            instanceId: null,
          },
        },
      }

      expect(isEpisodeAlreadyQueued('12345', 1, 1)).toBe(true)
      expect(isEpisodeAlreadyQueued('12345', 2, 1)).toBe(true)
      expect(isEpisodeAlreadyQueued('12345', 1, 2)).toBe(false)
      expect(isEpisodeAlreadyQueued('12345', 3, 1)).toBe(false)
    })
  })
})
