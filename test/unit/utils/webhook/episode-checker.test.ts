import { isRecentEpisode } from '@utils/webhook/episode-checker.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('episode-checker', () => {
  let mockFastify: FastifyInstance

  beforeEach(() => {
    mockFastify = {
      config: {
        newEpisodeThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      },
      log: createMockLogger(),
    } as unknown as FastifyInstance
  })

  describe('isRecentEpisode', () => {
    it('should return true for episode aired within threshold', () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(threeDaysAgo, mockFastify)

      expect(result).toBe(true)
    })

    it('should return true for episode within threshold (100ms buffer)', () => {
      const now = Date.now()
      // Subtract threshold minus 100ms to ensure we're definitely within the threshold
      // accounting for execution time between test setup and the actual check
      const justWithinThreshold = new Date(
        now - (7 * 24 * 60 * 60 * 1000 - 100),
      ).toISOString()

      const result = isRecentEpisode(justWithinThreshold, mockFastify)

      expect(result).toBe(true)
    })

    it('should return false for episode aired beyond threshold', () => {
      const now = Date.now()
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(tenDaysAgo, mockFastify)

      expect(result).toBe(false)
    })

    it('should return true for episode aired 1 hour ago', () => {
      const now = Date.now()
      const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()

      const result = isRecentEpisode(oneHourAgo, mockFastify)

      expect(result).toBe(true)
    })

    it('should return true for episode aired just now', () => {
      const now = new Date().toISOString()

      const result = isRecentEpisode(now, mockFastify)

      expect(result).toBe(true)
    })

    it('should return true for episode airing in the future', () => {
      const now = Date.now()
      const tomorrow = new Date(now + 24 * 60 * 60 * 1000).toISOString()

      // Age will be negative, but age <= threshold is still true
      const result = isRecentEpisode(tomorrow, mockFastify)

      expect(result).toBe(true)
    })

    it('should return false for missing airDateUtc', () => {
      const result = isRecentEpisode('', mockFastify)

      expect(result).toBe(false)
      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        'Missing airDateUtc in isRecentEpisode check',
      )
    })

    it('should return false for invalid date string (results in NaN)', () => {
      const result = isRecentEpisode('not-a-date', mockFastify)

      // Invalid Date converts to NaN, age will be NaN, NaN <= threshold is false
      expect(result).toBe(false)
    })

    it('should log debug information when checking episode', () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()

      isRecentEpisode(threeDaysAgo, mockFastify)

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
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
      const customFastify = {
        config: {
          newEpisodeThreshold: 24 * 60 * 60 * 1000, // 1 day
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
      const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000).toISOString()

      expect(isRecentEpisode(twoDaysAgo, customFastify)).toBe(false)
      expect(isRecentEpisode(twelveHoursAgo, customFastify)).toBe(true)
    })

    it('should handle threshold of 0', () => {
      const zeroThresholdFastify = {
        config: {
          newEpisodeThreshold: 0,
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      // With threshold 0, only age <= 0 is considered recent (future episodes only)
      // Use dates clearly in past/future to avoid timing flakiness
      const pastDate = new Date(Date.now() - 100).toISOString()
      const futureDate = new Date(Date.now() + 1000).toISOString()

      // Past episodes are not recent with threshold 0
      expect(isRecentEpisode(pastDate, zeroThresholdFastify)).toBe(false)

      // Future episodes (negative age) are always recent
      expect(isRecentEpisode(futureDate, zeroThresholdFastify)).toBe(true)
    })

    it('should handle very large threshold', () => {
      const largeFastify = {
        config: {
          newEpisodeThreshold: 365 * 24 * 60 * 60 * 1000, // 1 year
        },
        log: createMockLogger(),
      } as unknown as FastifyInstance

      const now = Date.now()
      const sixMonthsAgo = new Date(
        now - 180 * 24 * 60 * 60 * 1000,
      ).toISOString()

      const result = isRecentEpisode(sixMonthsAgo, largeFastify)

      expect(result).toBe(true)
    })

    it('should handle null airDateUtc', () => {
      const result = isRecentEpisode(null as unknown as string, mockFastify)

      expect(result).toBe(false)
      expect(mockFastify.log.warn).toHaveBeenCalled()
    })

    it('should handle undefined airDateUtc', () => {
      const result = isRecentEpisode(
        undefined as unknown as string,
        mockFastify,
      )

      expect(result).toBe(false)
      expect(mockFastify.log.warn).toHaveBeenCalled()
    })

    it('should calculate age correctly', () => {
      const now = Date.now()
      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()

      isRecentEpisode(fiveDaysAgo, mockFastify)

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          ageMs: expect.any(Number),
        }),
        'Checking if episode is recent',
      )

      const debugCall = vi.mocked(mockFastify.log.debug).mock.calls[0]
      const loggedAge = (debugCall[0] as { ageMs: number }).ageMs
      const expectedAge = 5 * 24 * 60 * 60 * 1000

      // Allow small tolerance for execution time
      expect(loggedAge).toBeGreaterThanOrEqual(expectedAge - 100)
      expect(loggedAge).toBeLessThanOrEqual(expectedAge + 100)
    })
  })
})
