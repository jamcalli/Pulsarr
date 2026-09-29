import type { Config } from '@root/types/config.types.js'
import {
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  parseRetryAfter,
  type RateLimitError,
} from '@services/plex-watchlist/api/helpers.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('plex/helpers', () => {
  describe('PLEX_API_TIMEOUT_MS', () => {
    it('should be set to 30000ms', () => {
      expect(PLEX_API_TIMEOUT_MS).toBe(30000)
    })
  })

  describe('isRateLimitError', () => {
    it('should return true for RateLimitError with isRateLimitExhausted=true', () => {
      const error: RateLimitError = Object.assign(new Error('Rate limited'), {
        isRateLimitExhausted: true,
      })
      expect(isRateLimitError(error)).toBe(true)
    })

    it('should return false for RateLimitError with isRateLimitExhausted=false', () => {
      const error = Object.assign(new Error('Not rate limited'), {
        isRateLimitExhausted: false,
      })
      expect(isRateLimitError(error)).toBe(false)
    })

    it('should return false for regular Error', () => {
      const error = new Error('Regular error')
      expect(isRateLimitError(error)).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isRateLimitError(null)).toBe(false)
      expect(isRateLimitError(undefined)).toBe(false)
      expect(isRateLimitError('error string')).toBe(false)
      expect(isRateLimitError(123)).toBe(false)
      expect(isRateLimitError({})).toBe(false)
    })

    it('should return false for object with isRateLimitExhausted but not Error', () => {
      const notError = { isRateLimitExhausted: true }
      expect(isRateLimitError(notError)).toBe(false)
    })
  })

  describe('hasValidPlexTokens', () => {
    it('should return true when config has non-empty plexTokens array', () => {
      const config: Config = {
        plexTokens: ['token1', 'token2'],
      } as Config
      expect(hasValidPlexTokens(config)).toBe(true)
    })

    it('should return true when config has single token in array', () => {
      const config: Config = {
        plexTokens: ['single-token'],
      } as Config
      expect(hasValidPlexTokens(config)).toBe(true)
    })

    it('should return false when plexTokens is empty array', () => {
      const config = {
        plexTokens: [],
      } as unknown as Config
      expect(hasValidPlexTokens(config)).toBe(false)
    })

    it('should return false when plexTokens is null', () => {
      const config = {
        plexTokens: null,
      } as unknown as Config
      expect(hasValidPlexTokens(config)).toBe(false)
    })

    it('should return false when plexTokens is undefined', () => {
      const config: Config = {} as Config
      expect(hasValidPlexTokens(config)).toBe(false)
    })

    it('should return false when plexTokens is not an array', () => {
      const config: Config = {
        plexTokens: 'not-an-array' as unknown as string[],
      } as Config
      expect(hasValidPlexTokens(config)).toBe(false)
    })
  })

  describe('parseRetryAfter', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should parse delay-seconds', () => {
      expect(parseRetryAfter('120')).toBe(120)
    })

    it('should convert a future HTTP date to seconds from now', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT')).toBe(30)
    })

    it('should return undefined for garbage', () => {
      expect(parseRetryAfter('not-a-date')).toBeUndefined()
    })

    it('should return undefined when the header is absent', () => {
      expect(parseRetryAfter(null)).toBeUndefined()
    })
  })
})
