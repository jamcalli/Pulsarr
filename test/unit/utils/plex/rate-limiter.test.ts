import { PlexRateLimiter } from '@root/utils/plex/rate-limiter.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('plex/rate-limiter', () => {
  let rateLimiter: PlexRateLimiter
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.useFakeTimers()
    rateLimiter = PlexRateLimiter.getInstance()
    rateLimiter.reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    rateLimiter.reset()
    vi.useRealTimers()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PlexRateLimiter.getInstance()
      const instance2 = PlexRateLimiter.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('isLimited', () => {
    it('should return false initially', () => {
      expect(rateLimiter.isLimited()).toBe(false)
    })

    it('should return true after setRateLimited is called', () => {
      rateLimiter.setRateLimited(5)
      expect(rateLimiter.isLimited()).toBe(true)
    })

    it('should return false after cooldown expires', () => {
      rateLimiter.setRateLimited(2)
      expect(rateLimiter.isLimited()).toBe(true)

      // Advance system time by 2.1 seconds to exceed the 2 second cooldown
      vi.advanceTimersByTime(2100)
      vi.setSystemTime(Date.now() + 2100)
      expect(rateLimiter.isLimited()).toBe(false)
    })
  })

  describe('getRemainingCooldown', () => {
    it('should return 0 when not rate limited', () => {
      expect(rateLimiter.getRemainingCooldown()).toBe(0)
    })

    it('should return remaining cooldown time in ms', () => {
      rateLimiter.setRateLimited(5)
      const remaining = rateLimiter.getRemainingCooldown()
      // Should be close to 5000ms (with jitter applied)
      expect(remaining).toBeGreaterThan(4000)
      expect(remaining).toBeLessThanOrEqual(5500)
    })

    it('should decrease as time passes', () => {
      rateLimiter.setRateLimited(5)
      const initial = rateLimiter.getRemainingCooldown()

      vi.advanceTimersByTime(2000)
      const afterTwoSeconds = rateLimiter.getRemainingCooldown()

      expect(afterTwoSeconds).toBeLessThan(initial)
      expect(afterTwoSeconds).toBeGreaterThan(0)
    })

    it('should return 0 after cooldown expires', () => {
      rateLimiter.setRateLimited(2)
      vi.advanceTimersByTime(3000) // Add extra buffer for jitter
      expect(rateLimiter.getRemainingCooldown()).toBe(0)
    })
  })

  describe('setRateLimited', () => {
    it('should use provided retry-after seconds', () => {
      const cooldownMs = rateLimiter.setRateLimited(10, mockLogger)
      // Should be close to 10000ms with jitter (±10%)
      expect(cooldownMs).toBeGreaterThan(9000)
      expect(cooldownMs).toBeLessThanOrEqual(11000)
    })

    it('should use exponential backoff when no retry-after provided', () => {
      const cooldown1 = rateLimiter.setRateLimited(undefined, mockLogger)
      // First failure: baseMultiplier * 1.5^0 = 2s (with jitter)
      expect(cooldown1).toBeGreaterThan(1500)
      expect(cooldown1).toBeLessThanOrEqual(2500)
    })

    it('should increase cooldown for consecutive failures', () => {
      rateLimiter.setRateLimited(undefined, mockLogger)

      // Simulate consecutive failure within 10 seconds
      vi.advanceTimersByTime(5000)
      const cooldown2 = rateLimiter.setRateLimited(undefined, mockLogger)

      // Second failure: baseMultiplier * 1.5^1 = 3s (with jitter)
      expect(cooldown2).toBeGreaterThan(2500)
      expect(cooldown2).toBeLessThanOrEqual(3500)
    })

    it('should reset consecutive counter after 10 seconds', () => {
      rateLimiter.setRateLimited(undefined, mockLogger)

      // Wait more than 10 seconds
      vi.advanceTimersByTime(11000)
      const cooldown2 = rateLimiter.setRateLimited(undefined, mockLogger)

      // Should reset to first failure cooldown
      expect(cooldown2).toBeGreaterThan(1500)
      expect(cooldown2).toBeLessThanOrEqual(2500)
    })

    it('should cap cooldown at maxCooldown (30s)', () => {
      // Simulate many consecutive failures
      for (let i = 0; i < 10; i++) {
        rateLimiter.setRateLimited(undefined, mockLogger)
        vi.advanceTimersByTime(1000) // Keep within 10s window
      }

      const cooldown = rateLimiter.setRateLimited(undefined, mockLogger)
      // Should not exceed 30s even with jitter
      expect(cooldown).toBeLessThanOrEqual(30000)
    })

    it('should apply jitter (±10%)', () => {
      const cooldowns: number[] = []
      for (let i = 0; i < 5; i++) {
        rateLimiter.reset()
        cooldowns.push(rateLimiter.setRateLimited(10, mockLogger))
      }

      // With jitter, we should get different values
      const uniqueValues = new Set(cooldowns)
      expect(uniqueValues.size).toBeGreaterThan(1)

      // All values should be within ±10% of 10000ms
      for (const cooldown of cooldowns) {
        expect(cooldown).toBeGreaterThan(9000)
        expect(cooldown).toBeLessThanOrEqual(11000)
      }
    })

    it('should clamp minimum cooldown to 0.1s', () => {
      const cooldown = rateLimiter.setRateLimited(0, mockLogger)
      expect(cooldown).toBeGreaterThanOrEqual(100)
    })

    it('should log warning with cooldown info', () => {
      rateLimiter.setRateLimited(5, mockLogger)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Plex rate limit detected'),
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Consecutive rate limits: 1'),
      )
    })

    it('should return cooldown in milliseconds', () => {
      const cooldown = rateLimiter.setRateLimited(3, mockLogger)
      expect(cooldown).toBeGreaterThan(2700)
      expect(cooldown).toBeLessThanOrEqual(3300)
    })
  })

  describe('waitIfLimited', () => {
    it('should return false when not rate limited', async () => {
      const result = await rateLimiter.waitIfLimited(mockLogger)
      expect(result).toBe(false)
    })

    it('should wait for cooldown when rate limited', async () => {
      rateLimiter.setRateLimited(2, mockLogger)

      expect(rateLimiter.isLimited()).toBe(true)

      const waitPromise = rateLimiter.waitIfLimited(mockLogger)

      // Run all timers to completion
      await vi.runAllTimersAsync()
      const result = await waitPromise

      // Should have waited and returned true
      expect(result).toBe(true)
    })

    it('should log wait message', async () => {
      rateLimiter.setRateLimited(2, mockLogger)
      vi.clearAllMocks()

      const waitPromise = rateLimiter.waitIfLimited(mockLogger)
      await vi.runAllTimersAsync()
      await waitPromise

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Waiting'),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('for Plex rate limit cooldown'),
      )
    })

    it('should emit progress updates when progress service provided', async () => {
      const mockProgress = {
        emit: vi.fn(),
      }

      rateLimiter.setRateLimited(2, mockLogger)

      const waitPromise = rateLimiter.waitIfLimited(mockLogger, {
        progress: mockProgress as never,
        operationId: 'test-op',
        type: 'self-watchlist',
      })

      await vi.runAllTimersAsync()
      await waitPromise

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'test-op',
          type: 'self-watchlist',
          phase: 'processing',
          progress: 50,
          message: expect.stringContaining('Rate limited by Plex API'),
        }),
      )
    })

    it('should use custom progress value when provided', async () => {
      const mockProgress = {
        emit: vi.fn(),
      }

      rateLimiter.setRateLimited(2, mockLogger)

      const waitPromise = rateLimiter.waitIfLimited(mockLogger, {
        progress: mockProgress as never,
        operationId: 'test-op',
        type: 'system',
        currentProgress: 75,
      })

      await vi.runAllTimersAsync()
      await waitPromise

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 75,
        }),
      )
    })

    it('should use custom message when provided', async () => {
      const mockProgress = {
        emit: vi.fn(),
      }

      rateLimiter.setRateLimited(2, mockLogger)

      const waitPromise = rateLimiter.waitIfLimited(mockLogger, {
        progress: mockProgress as never,
        operationId: 'test-op',
        type: 'rss-feed',
        message: 'Custom rate limit message',
      })

      await vi.runAllTimersAsync()
      await waitPromise

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom rate limit message',
        }),
      )
    })

    it('should return false if remaining cooldown is 0 or negative', async () => {
      rateLimiter.setRateLimited(2, mockLogger)
      vi.advanceTimersByTime(3000) // Add buffer for jitter

      const result = await rateLimiter.waitIfLimited(mockLogger)
      expect(result).toBe(false)
    })
  })

  describe('reset', () => {
    it('should clear rate limited state', () => {
      rateLimiter.setRateLimited(5, mockLogger)
      expect(rateLimiter.isLimited()).toBe(true)

      rateLimiter.reset()
      expect(rateLimiter.isLimited()).toBe(false)
      expect(rateLimiter.getRemainingCooldown()).toBe(0)
    })

    it('should reset consecutive failure counter', () => {
      // Build up consecutive failures
      rateLimiter.setRateLimited(undefined, mockLogger)
      vi.advanceTimersByTime(1000)
      rateLimiter.setRateLimited(undefined, mockLogger)

      rateLimiter.reset()

      // Next failure should use base multiplier
      const cooldown = rateLimiter.setRateLimited(undefined, mockLogger)
      expect(cooldown).toBeGreaterThan(1500)
      expect(cooldown).toBeLessThanOrEqual(2500)
    })
  })
})
