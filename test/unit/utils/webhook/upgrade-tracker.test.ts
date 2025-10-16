import { webhookQueue } from '@utils/webhook/queue-state.js'
import { checkForUpgrade } from '@utils/webhook/upgrade-tracker.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('upgrade-tracker', () => {
  let mockFastify: FastifyInstance

  beforeEach(() => {
    vi.useFakeTimers()
    mockFastify = {
      config: {
        upgradeBufferTime: 5000, // 5 seconds
      },
      log: createMockLogger(),
    } as unknown as FastifyInstance
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clean up the queue
    for (const key in webhookQueue) {
      delete webhookQueue[key]
    }
  })

  describe('checkForUpgrade', () => {
    it('should initialize queue for new show', async () => {
      const promise = checkForUpgrade('12345', 1, 1, false, null, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      const result = await promise

      expect(webhookQueue['12345']).toBeDefined()
      expect(webhookQueue['12345'].title).toBe('')
      expect(webhookQueue['12345'].seasons).toBeDefined()
      expect(result).toBe(false)
    })

    it('should initialize season queue when not present', async () => {
      webhookQueue['12345'] = {
        title: 'Test Show',
        seasons: {},
      }

      const promise = checkForUpgrade('12345', 1, 1, false, 123, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      const result = await promise

      expect(webhookQueue['12345'].seasons[1]).toBeDefined()
      expect(webhookQueue['12345'].seasons[1].upgradeTracker).toBeDefined()
      expect(webhookQueue['12345'].seasons[1].instanceId).toBe(123)
      expect(result).toBe(false)
    })

    it('should return false when no upgrade events recorded', async () => {
      const promise = checkForUpgrade('12345', 1, 1, false, null, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      const result = await promise

      expect(result).toBe(false)
    })

    it('should return true when upgrade event is recorded', async () => {
      const promise = checkForUpgrade('12345', 1, 1, true, null, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      const result = await promise

      expect(result).toBe(true)
    })

    it('should detect upgrade from multiple webhook events', async () => {
      // First webhook: not an upgrade
      const promise1 = checkForUpgrade('12345', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise1

      // Second webhook: is an upgrade
      const promise2 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise2

      expect(result).toBe(true)
    })

    it('should track different episodes separately', async () => {
      // Episode 1 - upgrade
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result1 = await promise1

      // Episode 2 - not upgrade
      const promise2 = checkForUpgrade('12345', 1, 2, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result2 = await promise2

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })

    it('should clean up expired entries based on buffer time', async () => {
      // Record first event for episode 1
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise1

      // Record event for episode 2 (so we have 2 entries)
      const promise2 = checkForUpgrade('12345', 1, 2, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise2

      // Advance time beyond buffer (5000ms + some extra)
      await vi.advanceTimersByTimeAsync(6000)

      // Record new event - old episode 1 should be cleaned, episode 2 also cleaned
      const promise3 = checkForUpgrade('12345', 1, 3, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise3

      // Should not detect upgrade since old events were cleaned
      expect(result).toBe(false)
      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          cleanedEntries: 2,
        }),
        'Cleaned old entries from upgrade tracker',
      )
    })

    it('should keep recent entries within buffer time', async () => {
      // Record upgrade event
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise1

      // Advance time but stay within buffer (3 seconds < 5 second buffer)
      await vi.advanceTimersByTimeAsync(3000)

      // Check again
      const promise2 = checkForUpgrade('12345', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise2

      // Should still detect upgrade
      expect(result).toBe(true)
    })

    it('should track different episodes separately in upgrade tracker', async () => {
      // Episode 1 - upgrade
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result1 = await promise1

      // Episode 2 - not upgrade (immediately after)
      const promise2 = checkForUpgrade('12345', 1, 2, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result2 = await promise2

      // Results should be independent
      expect(result1).toBe(true)
      expect(result2).toBe(false)

      // Verify tracker has both episodes
      const seasonQueue = webhookQueue['12345'].seasons[1]
      expect(seasonQueue.upgradeTracker.has('1-1')).toBe(true)
      expect(seasonQueue.upgradeTracker.has('1-2')).toBe(true)
    })

    it('should wait 500ms before checking upgrade status', async () => {
      const promise = checkForUpgrade('12345', 1, 1, true, null, mockFastify)

      // Advance exactly 500ms
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise

      // Should complete after 500ms
      expect(result).toBe(true)
    })

    it('should log debug information during check', async () => {
      const promise = checkForUpgrade('12345', 1, 1, true, null, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      await promise

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        {
          tvdbId: '12345',
          seasonNumber: 1,
          episodeNumber: 1,
          isUpgrade: true,
        },
        'Checking for upgrade activity',
      )

      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tvdbId: '12345',
          seasonNumber: 1,
          episodeNumber: 1,
          recentWebhooksCount: expect.any(Number),
          hasUpgrade: true,
        }),
        'Upgrade check result',
      )
    })

    it('should handle multiple shows independently', async () => {
      // Show 1 - upgrade
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result1 = await promise1

      // Show 2 - no upgrade
      const promise2 = checkForUpgrade('67890', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result2 = await promise2

      expect(result1).toBe(true)
      expect(result2).toBe(false)
      expect(webhookQueue['12345']).toBeDefined()
      expect(webhookQueue['67890']).toBeDefined()
    })

    it('should handle multiple seasons in same show', async () => {
      // Season 1 - upgrade
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result1 = await promise1

      // Season 2 - no upgrade
      const promise2 = checkForUpgrade('12345', 2, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result2 = await promise2

      expect(result1).toBe(true)
      expect(result2).toBe(false)
      expect(webhookQueue['12345'].seasons[1]).toBeDefined()
      expect(webhookQueue['12345'].seasons[2]).toBeDefined()
    })

    it('should preserve instanceId when initializing season', async () => {
      const promise = checkForUpgrade('12345', 1, 1, false, 999, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      await promise

      expect(webhookQueue['12345'].seasons[1].instanceId).toBe(999)
    })

    it('should handle null instanceId', async () => {
      const promise = checkForUpgrade('12345', 1, 1, false, null, mockFastify)

      await vi.advanceTimersByTimeAsync(500)
      await promise

      expect(webhookQueue['12345'].seasons[1].instanceId).toBeNull()
    })

    it('should accumulate multiple webhook events for same episode', async () => {
      // Record 3 events for same episode
      const promise1 = checkForUpgrade('12345', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise1

      const promise2 = checkForUpgrade('12345', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise2

      const promise3 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise3

      // Verify the count in logs
      expect(mockFastify.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          recentWebhooksCount: 3,
          hasUpgrade: true,
        }),
        'Upgrade check result',
      )
    })

    it('should only clean up entries older than buffer time', async () => {
      // Event 1 at t=0
      const promise1 = checkForUpgrade('12345', 1, 1, true, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      await promise1

      // Immediately check - event 1 should still be there
      const promise2 = checkForUpgrade('12345', 1, 1, false, null, mockFastify)
      await vi.advanceTimersByTimeAsync(500)
      const result1 = await promise2

      expect(result1).toBe(true) // Should detect the upgrade event

      // Verify no cleanup happened (event is recent)
      const callsWithCleanedEntries = vi
        .mocked(mockFastify.log.debug)
        .mock.calls.filter(
          (call) =>
            call[0] &&
            typeof call[0] === 'object' &&
            'cleanedEntries' in call[0],
        )
      expect(callsWithCleanedEntries.length).toBe(0)
    })
  })
})
