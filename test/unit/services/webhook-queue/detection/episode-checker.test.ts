import {
  type EpisodeCheckerDeps,
  isRecentEpisode,
} from '@services/webhook-queue/detection/episode-checker.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('episode-checker', () => {
  let deps: EpisodeCheckerDeps

  beforeEach(() => {
    deps = {
      logger: createMockLogger(),
      newEpisodeThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    }
  })

  describe('isRecentEpisode', () => {
    it('should return true for episode aired within threshold', () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(threeDaysAgo, deps)

      expect(result).toBe(true)
    })

    it('should return true for episode within threshold (100ms buffer)', () => {
      const now = Date.now()
      const justWithinThreshold = new Date(
        now - (7 * 24 * 60 * 60 * 1000 - 100),
      ).toISOString()

      const result = isRecentEpisode(justWithinThreshold, deps)

      expect(result).toBe(true)
    })

    it('should return false for episode aired beyond threshold', () => {
      const now = Date.now()
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(tenDaysAgo, deps)

      expect(result).toBe(false)
    })

    it('should return true for episode aired 1 hour ago', () => {
      const now = Date.now()
      const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(oneHourAgo, deps)

      expect(result).toBe(true)
    })

    it('should return true for episode aired just now', () => {
      const now = new Date().toISOString()

      const result = isRecentEpisode(now, deps)

      expect(result).toBe(true)
    })

    it('should return true for episode airing in the future', () => {
      const now = Date.now()
      const tomorrow = new Date(now + 24 * 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(tomorrow, deps)

      expect(result).toBe(true)
    })

    it('should return false for missing airDateUtc', () => {
      const result = isRecentEpisode('', deps)

      expect(result).toBe(false)
      expect(deps.logger.warn).toHaveBeenCalledWith(
        'Missing airDateUtc in isRecentEpisode check',
      )
    })

    it('should return false for invalid date string (results in NaN)', () => {
      const result = isRecentEpisode('not-a-date', deps)

      expect(result).toBe(false)
    })

    it('should log debug information when checking episode', () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()

      isRecentEpisode(threeDaysAgo, deps)

      expect(deps.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          airDateUtc: threeDaysAgo,
          airDateMs: expect.any(Number),
          nowMs: expect.any(Number),
          ageMs: expect.any(Number),
          thresholdMs: 7 * 24 * 60 * 60 * 1000,
          isRecent: true,
        }),
        'Checking if episode is recent',
      )
    })

    it('should respect custom threshold values', () => {
      const customDeps: EpisodeCheckerDeps = {
        logger: createMockLogger(),
        newEpisodeThreshold: 24 * 60 * 60 * 1000, // 1 day
      }

      const now = Date.now()
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
      const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000).toISOString()

      expect(isRecentEpisode(twoDaysAgo, customDeps)).toBe(false)
      expect(isRecentEpisode(twelveHoursAgo, customDeps)).toBe(true)
    })

    it('should handle threshold of 0', () => {
      const zeroThresholdDeps: EpisodeCheckerDeps = {
        logger: createMockLogger(),
        newEpisodeThreshold: 0,
      }

      const pastDate = new Date(Date.now() - 100).toISOString()
      const futureDate = new Date(Date.now() + 1000).toISOString()

      expect(isRecentEpisode(pastDate, zeroThresholdDeps)).toBe(false)
      expect(isRecentEpisode(futureDate, zeroThresholdDeps)).toBe(true)
    })

    it('should handle very large threshold', () => {
      const largeDeps: EpisodeCheckerDeps = {
        logger: createMockLogger(),
        newEpisodeThreshold: 365 * 24 * 60 * 60 * 1000, // 1 year
      }

      const now = Date.now()
      const sixMonthsAgo = new Date(
        now - 180 * 24 * 60 * 60 * 1000,
      ).toISOString()

      const result = isRecentEpisode(sixMonthsAgo, largeDeps)

      expect(result).toBe(true)
    })

    it('should handle null airDateUtc', () => {
      const result = isRecentEpisode(null as unknown as string, deps)

      expect(result).toBe(false)
      expect(deps.logger.warn).toHaveBeenCalled()
    })

    it('should handle undefined airDateUtc', () => {
      const result = isRecentEpisode(undefined as unknown as string, deps)

      expect(result).toBe(false)
      expect(deps.logger.warn).toHaveBeenCalled()
    })

    it('should calculate age correctly', () => {
      const now = Date.now()
      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()

      isRecentEpisode(fiveDaysAgo, deps)

      expect(deps.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          ageMs: expect.any(Number),
        }),
        'Checking if episode is recent',
      )

      const debugCall = vi.mocked(deps.logger.debug).mock.calls[0]
      const loggedAge = (debugCall[0] as { ageMs: number }).ageMs
      const expectedAge = 5 * 24 * 60 * 60 * 1000

      expect(loggedAge).toBeGreaterThanOrEqual(expectedAge - 100)
      expect(loggedAge).toBeLessThanOrEqual(expectedAge + 100)
    })
  })
})
