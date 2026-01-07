import {
  delayWithBackoffAndJitter,
  isSameServerEndpoint,
  normalizeBasePath,
  normalizeEndpointWithPath,
} from '@utils/url.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('url', () => {
  describe('normalizeBasePath', () => {
    it('should return / for root path', () => {
      expect(normalizeBasePath('/')).toBe('/')
    })

    it('should return / for empty string', () => {
      expect(normalizeBasePath('')).toBe('/')
    })

    it('should return / for undefined', () => {
      expect(normalizeBasePath(undefined)).toBe('/')
    })

    it('should add leading slash to path without one', () => {
      expect(normalizeBasePath('pulsarr')).toBe('/pulsarr')
    })

    it('should remove trailing slash from path', () => {
      expect(normalizeBasePath('/pulsarr/')).toBe('/pulsarr')
    })

    it('should handle path without leading slash but with trailing slash', () => {
      expect(normalizeBasePath('pulsarr/')).toBe('/pulsarr')
    })

    it('should handle multiple leading slashes', () => {
      expect(normalizeBasePath('//pulsarr')).toBe('/pulsarr')
    })

    it('should handle multiple trailing slashes', () => {
      expect(normalizeBasePath('pulsarr//')).toBe('/pulsarr')
    })

    it('should handle multiple leading and trailing slashes', () => {
      expect(normalizeBasePath('//pulsarr//')).toBe('/pulsarr')
    })

    it('should handle nested paths', () => {
      expect(normalizeBasePath('/api/v1')).toBe('/api/v1')
    })

    it('should handle nested paths with trailing slash', () => {
      expect(normalizeBasePath('/api/v1/')).toBe('/api/v1')
    })
  })

  describe('delayWithBackoffAndJitter', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should resolve after delay on first attempt', async () => {
      // Base delay 100ms + up to 10% jitter = 100-110ms
      const promise = delayWithBackoffAndJitter(0, 100, 2000)
      await vi.advanceTimersByTimeAsync(110)
      await promise
    })

    it('should double delay on second attempt', async () => {
      // 100 * 2^1 = 200ms + up to 10% jitter = 200-220ms
      const promise = delayWithBackoffAndJitter(1, 100, 2000)
      await vi.advanceTimersByTimeAsync(220)
      await promise
    })

    it('should cap delay at maxDelayMs', async () => {
      // Would be 100 * 2^10 = 102400ms, but capped at 500ms + 10% jitter = 550ms
      const promise = delayWithBackoffAndJitter(10, 100, 500)
      await vi.advanceTimersByTimeAsync(550)
      await promise
    })

    it('should use default baseDelayMs of 500', async () => {
      // Default 500ms + up to 10% jitter = 550ms
      const promise = delayWithBackoffAndJitter(0)
      await vi.advanceTimersByTimeAsync(550)
      await promise
    })

    it('should use default maxDelayMs of 2000', async () => {
      // 500 * 2^5 = 16000, capped at default 2000ms + 10% jitter = 2200ms
      const promise = delayWithBackoffAndJitter(5, 500)
      await vi.advanceTimersByTimeAsync(2200)
      await promise
    })
  })

  describe('normalizeEndpointWithPath', () => {
    it('should return empty string for null', () => {
      expect(normalizeEndpointWithPath(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(normalizeEndpointWithPath(undefined)).toBe('')
    })

    it('should normalize URL with protocol', () => {
      expect(normalizeEndpointWithPath('http://example.com/api')).toBe(
        'http://example.com/api',
      )
    })

    it('should assume http:// when no protocol is present', () => {
      expect(normalizeEndpointWithPath('example.com/api')).toBe(
        'http://example.com/api',
      )
    })

    it('should remove trailing slash from path', () => {
      expect(normalizeEndpointWithPath('http://example.com/api/')).toBe(
        'http://example.com/api',
      )
    })

    it('should handle URL without path', () => {
      expect(normalizeEndpointWithPath('http://example.com')).toBe(
        'http://example.com/',
      )
    })

    it('should handle URL with port', () => {
      expect(normalizeEndpointWithPath('http://example.com:8080/api')).toBe(
        'http://example.com:8080/api',
      )
    })

    it('should handle https protocol', () => {
      expect(normalizeEndpointWithPath('https://example.com/api')).toBe(
        'https://example.com/api',
      )
    })

    it('should handle nested paths', () => {
      expect(normalizeEndpointWithPath('http://example.com/api/v1/users')).toBe(
        'http://example.com/api/v1/users',
      )
    })

    it('should handle IPv6 addresses', () => {
      expect(normalizeEndpointWithPath('http://[::1]:8080/api')).toBe(
        'http://[::1]:8080/api',
      )
    })

    it('should handle malformed URLs with fallback', () => {
      const result = normalizeEndpointWithPath('not a valid url!!')
      expect(result).toBe('not a valid url!!')
    })

    it('should remove query parameters from URL', () => {
      expect(
        normalizeEndpointWithPath('http://example.com/api?key=value'),
      ).toBe('http://example.com/api')
    })

    it('should remove multiple trailing slashes', () => {
      expect(normalizeEndpointWithPath('http://example.com/api///')).toBe(
        'http://example.com/api',
      )
    })
  })

  describe('isSameServerEndpoint', () => {
    it('should return true for identical URLs', () => {
      expect(
        isSameServerEndpoint('http://example.com', 'http://example.com'),
      ).toBe(true)
    })

    it('should return true for URLs with different trailing slashes', () => {
      expect(
        isSameServerEndpoint('http://example.com', 'http://example.com/'),
      ).toBe(true)
    })

    it('should return true for case insensitive protocol', () => {
      expect(
        isSameServerEndpoint('http://example.com', 'HTTP://example.com'),
      ).toBe(true)
    })

    it('should return true for case insensitive hostname', () => {
      expect(
        isSameServerEndpoint('http://EXAMPLE.COM', 'http://example.com'),
      ).toBe(true)
    })

    it('should return true when one URL has no protocol', () => {
      expect(
        isSameServerEndpoint('sonarr.local:8989', 'http://sonarr.local:8989'),
      ).toBe(true)
    })

    it('should return true for mixed case with port', () => {
      expect(isSameServerEndpoint('HOST:8989', 'host:8989')).toBe(true)
    })

    it('should return true for IPv6 addresses', () => {
      expect(
        isSameServerEndpoint('https://[::1]:8989', 'HTTPS://[::1]:8989'),
      ).toBe(true)
    })

    it('should return true for IPv6 with trailing slash difference', () => {
      expect(
        isSameServerEndpoint('http://[::1]:8989', 'http://[::1]:8989/'),
      ).toBe(true)
    })

    it('should return false for different hostnames', () => {
      expect(
        isSameServerEndpoint('http://server-a:8989', 'http://server-b:8989'),
      ).toBe(false)
    })

    it('should return false for different ports', () => {
      expect(
        isSameServerEndpoint(
          'http://example.com:8080',
          'http://example.com:9090',
        ),
      ).toBe(false)
    })

    it('should return false for different protocols', () => {
      expect(
        isSameServerEndpoint('http://example.com', 'https://example.com'),
      ).toBe(false)
    })

    it('should return true when both inputs are null', () => {
      expect(isSameServerEndpoint(null, null)).toBe(true)
    })

    it('should return true when both inputs are undefined', () => {
      expect(isSameServerEndpoint(undefined, undefined)).toBe(true)
    })

    it('should return true when both inputs are empty string', () => {
      expect(isSameServerEndpoint('', '')).toBe(true)
    })

    it('should return false when one is null and other is a URL', () => {
      expect(isSameServerEndpoint(null, 'http://example.com')).toBe(false)
    })

    it('should ignore paths when comparing', () => {
      expect(
        isSameServerEndpoint(
          'http://example.com/api/v1',
          'http://example.com/api/v2',
        ),
      ).toBe(true)
    })

    it('should handle malformed URLs with fallback comparison', () => {
      expect(isSameServerEndpoint('invalid url', 'invalid url')).toBe(true)
    })

    it('should return false for different malformed URLs', () => {
      expect(isSameServerEndpoint('invalid url 1', 'invalid url 2')).toBe(false)
    })
  })
})
