import type { SeasonQueue, WebhookQueue } from '@root/types/webhook.types.js'
import {
  fetchExpectedEpisodeCount,
  isSeasonComplete,
  type SeasonCompletionDeps,
} from '@services/webhook-queue/detection/season-completion.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

type GetSeasonEpisodeCount = SeasonCompletionDeps['getSeasonEpisodeCount']

describe('season-completion', () => {
  let queue: WebhookQueue
  let getSeasonEpisodeCount: Mock<GetSeasonEpisodeCount>
  let deps: SeasonCompletionDeps

  beforeEach(() => {
    queue = {}
    getSeasonEpisodeCount = vi.fn<GetSeasonEpisodeCount>()
    deps = { logger: createMockLogger(), queue, getSeasonEpisodeCount }
  })

  function seedSeason(
    tvdbId: string,
    seasonNumber: number,
    season: Partial<SeasonQueue>,
  ): void {
    queue[tvdbId] ??= { title: 'Test Show', seasons: {} }
    queue[tvdbId].seasons[seasonNumber] = {
      episodes: [],
      firstReceived: new Date(),
      lastUpdated: new Date(),
      notifiedSeasons: new Set(),
      instanceId: null,
      ...season,
    }
  }

  describe('fetchExpectedEpisodeCount', () => {
    it("should query the season's own instance and series ID", async () => {
      seedSeason('100', 2, { instanceId: 7, sonarrSeriesId: 555 })
      getSeasonEpisodeCount.mockResolvedValue(10)

      const result = await fetchExpectedEpisodeCount('100', 2, deps)

      expect(getSeasonEpisodeCount).toHaveBeenCalledWith(7, 555, 2)
      expect(result).toBe(10)
    })

    it('should subtract the pilot for a pilot-rolling season', async () => {
      seedSeason('100', 1, {
        instanceId: 7,
        sonarrSeriesId: 555,
        isPilotRolling: true,
      })
      getSeasonEpisodeCount.mockResolvedValue(8)

      expect(await fetchExpectedEpisodeCount('100', 1, deps)).toBe(7)
    })

    it('should resolve each instance of a synced show independently', async () => {
      // Same show on two instances: instance 1 full-season, instance 2 pilot-rolling.
      seedSeason('100', 1, { instanceId: 1, sonarrSeriesId: 111 })
      seedSeason('100', 2, {
        instanceId: 2,
        sonarrSeriesId: 222,
        isPilotRolling: true,
      })
      getSeasonEpisodeCount.mockImplementation(async (instanceId: number) =>
        instanceId === 1 ? 10 : 8,
      )

      const s1 = await fetchExpectedEpisodeCount('100', 1, deps)
      const s2 = await fetchExpectedEpisodeCount('100', 2, deps)

      expect(getSeasonEpisodeCount).toHaveBeenCalledWith(1, 111, 1)
      expect(getSeasonEpisodeCount).toHaveBeenCalledWith(2, 222, 2)
      expect(s1).toBe(10)
      expect(s2).toBe(7)
    })

    it('should return null when instance or series ID is missing', async () => {
      seedSeason('100', 1, { instanceId: null, sonarrSeriesId: undefined })

      expect(await fetchExpectedEpisodeCount('100', 1, deps)).toBeNull()
      expect(getSeasonEpisodeCount).not.toHaveBeenCalled()
    })

    it('should cache the expected count after the first fetch', async () => {
      seedSeason('100', 1, { instanceId: 7, sonarrSeriesId: 555 })
      getSeasonEpisodeCount.mockResolvedValue(10)

      await fetchExpectedEpisodeCount('100', 1, deps)
      await fetchExpectedEpisodeCount('100', 1, deps)

      expect(getSeasonEpisodeCount).toHaveBeenCalledTimes(1)
    })
  })

  describe('isSeasonComplete', () => {
    it('should be complete when received meets the pilot-adjusted count', async () => {
      seedSeason('100', 1, {
        instanceId: 2,
        sonarrSeriesId: 222,
        isPilotRolling: true,
        episodes: [2, 3, 4, 5, 6, 7, 8].map(episode),
      })
      getSeasonEpisodeCount.mockResolvedValue(8)
      await fetchExpectedEpisodeCount('100', 1, deps)

      expect(isSeasonComplete('100', 1, deps)).toBe(true)
    })

    it('should not be complete before the adjusted count is reached', async () => {
      seedSeason('100', 1, {
        instanceId: 2,
        sonarrSeriesId: 222,
        isPilotRolling: true,
        episodes: [2, 3].map(episode),
      })
      getSeasonEpisodeCount.mockResolvedValue(8)
      await fetchExpectedEpisodeCount('100', 1, deps)

      expect(isSeasonComplete('100', 1, deps)).toBe(false)
    })
  })
})

function episode(episodeNumber: number) {
  return {
    seasonNumber: 1,
    episodeNumber,
    title: `E${episodeNumber}`,
    airDateUtc: '2024-01-01T00:00:00Z',
  }
}
