import {
  createEmptyResult,
  createSafetyTriggeredResult,
} from '@services/delete-sync/result-builder.js'
import { describe, expect, it } from 'vitest'

describe('result-builder', () => {
  describe('createEmptyResult', () => {
    it('should create result with all zeros', () => {
      const result = createEmptyResult('Test message')

      expect(result.total.deleted).toBe(0)
      expect(result.total.skipped).toBe(0)
      expect(result.total.protected).toBe(0)
      expect(result.total.processed).toBe(0)

      expect(result.movies.deleted).toBe(0)
      expect(result.movies.skipped).toBe(0)
      expect(result.movies.protected).toBe(0)
      expect(result.movies.items).toEqual([])

      expect(result.shows.deleted).toBe(0)
      expect(result.shows.skipped).toBe(0)
      expect(result.shows.protected).toBe(0)
      expect(result.shows.items).toEqual([])
    })

    it('should not include safety properties', () => {
      const result = createEmptyResult('Test message')

      expect(result.safetyTriggered).toBeUndefined()
      expect(result.safetyMessage).toBeUndefined()
    })

    it('should create same result regardless of message', () => {
      const result1 = createEmptyResult('Message 1')
      const result2 = createEmptyResult('Message 2')
      const result3 = createEmptyResult('')

      expect(result1).toEqual(result2)
      expect(result1).toEqual(result3)
    })
  })

  describe('createSafetyTriggeredResult', () => {
    it('should create result with zero counts when no series/movies provided', () => {
      const message = 'Safety check failed'
      const result = createSafetyTriggeredResult(message)

      expect(result.total.deleted).toBe(0)
      expect(result.total.skipped).toBe(0)
      expect(result.total.protected).toBe(0)
      expect(result.total.processed).toBe(0)

      expect(result.movies.deleted).toBe(0)
      expect(result.movies.skipped).toBe(0)
      expect(result.movies.protected).toBe(0)
      expect(result.movies.items).toEqual([])

      expect(result.shows.deleted).toBe(0)
      expect(result.shows.skipped).toBe(0)
      expect(result.shows.protected).toBe(0)
      expect(result.shows.items).toEqual([])

      expect(result.safetyTriggered).toBe(true)
      expect(result.safetyMessage).toBe(message)
    })

    it('should track movie count as skipped', () => {
      const message = 'Safety check failed'
      const result = createSafetyTriggeredResult(message, 0, 100)

      expect(result.movies.skipped).toBe(100)
      expect(result.shows.skipped).toBe(0)
      expect(result.total.skipped).toBe(100)
      expect(result.total.processed).toBe(100)
    })

    it('should track series count as skipped', () => {
      const message = 'Safety check failed'
      const result = createSafetyTriggeredResult(message, 50, 0)

      expect(result.shows.skipped).toBe(50)
      expect(result.movies.skipped).toBe(0)
      expect(result.total.skipped).toBe(50)
      expect(result.total.processed).toBe(50)
    })

    it('should track both series and movies as skipped', () => {
      const message = 'Safety check failed'
      const result = createSafetyTriggeredResult(message, 50, 100)

      expect(result.shows.skipped).toBe(50)
      expect(result.movies.skipped).toBe(100)
      expect(result.total.skipped).toBe(150)
      expect(result.total.processed).toBe(150)
    })

    it('should always have deleted count of 0', () => {
      const result = createSafetyTriggeredResult('Test', 100, 100)

      expect(result.total.deleted).toBe(0)
      expect(result.movies.deleted).toBe(0)
      expect(result.shows.deleted).toBe(0)
    })

    it('should always have protected count of 0', () => {
      const result = createSafetyTriggeredResult('Test', 100, 100)

      expect(result.total.protected).toBe(0)
      expect(result.movies.protected).toBe(0)
      expect(result.shows.protected).toBe(0)
    })

    it('should always have empty items arrays', () => {
      const result = createSafetyTriggeredResult('Test', 100, 100)

      expect(result.movies.items).toEqual([])
      expect(result.shows.items).toEqual([])
    })

    it('should include safety triggered flag', () => {
      const result = createSafetyTriggeredResult('Test message')

      expect(result.safetyTriggered).toBe(true)
    })

    it('should include safety message', () => {
      const message = 'Would delete too many items'
      const result = createSafetyTriggeredResult(message, 0, 0)

      expect(result.safetyMessage).toBe(message)
    })

    it('should preserve multiline error messages', () => {
      const message = 'Safety check failed:\n- Too many deletions\n- Aborting'
      const result = createSafetyTriggeredResult(message, 0, 0)

      expect(result.safetyMessage).toBe(message)
    })
  })

  describe('comparison between result types', () => {
    it('should differentiate empty from safety triggered', () => {
      const empty = createEmptyResult('Empty')
      const safety = createSafetyTriggeredResult('Safety', 0, 0)

      expect(empty.safetyTriggered).toBeUndefined()
      expect(safety.safetyTriggered).toBe(true)
      expect(empty.safetyMessage).toBeUndefined()
      expect(safety.safetyMessage).toBe('Safety')
    })

    it('should have same structure but different flags', () => {
      const empty = createEmptyResult('Test')
      const safety = createSafetyTriggeredResult('Test', 0, 0)

      // Both should have same count structure (all zeros)
      expect(empty.total.deleted).toBe(safety.total.deleted)
      expect(empty.total.skipped).toBe(safety.total.skipped)
      expect(empty.total.protected).toBe(safety.total.protected)
      expect(empty.total.processed).toBe(safety.total.processed)

      // But different flags
      expect(empty.safetyTriggered).not.toBe(safety.safetyTriggered)
    })
  })

  describe('edge cases', () => {
    it('should handle very large counts', () => {
      const result = createSafetyTriggeredResult('Test', 999999, 999999)

      expect(result.total.skipped).toBe(1999998)
      expect(result.total.processed).toBe(1999998)
    })

    it('should handle empty string message', () => {
      const result = createSafetyTriggeredResult('', 10, 10)

      expect(result.safetyMessage).toBe('')
      expect(result.safetyTriggered).toBe(true)
    })

    it('should handle special characters in message', () => {
      const message = 'Error: 50% > 10% (threshold)'
      const result = createSafetyTriggeredResult(message, 0, 0)

      expect(result.safetyMessage).toBe(message)
    })
  })
})
