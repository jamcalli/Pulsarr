import type { DatabaseService } from '@services/database.service.js'
import {
  ensureTrackedCache,
  isAnyGuidTracked,
} from '@services/delete-sync/cache/tracked-cache.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('tracked-cache', () => {
  let mockDbService: Pick<DatabaseService, 'getTrackedContentGuids'>
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDbService = {
      getTrackedContentGuids: vi.fn(),
    }
  })

  describe('ensureTrackedCache', () => {
    it('should return null when tracked-only is disabled', async () => {
      const result = await ensureTrackedCache(
        null,
        false, // disabled
        mockDbService as unknown as DatabaseService,
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockDbService.getTrackedContentGuids).not.toHaveBeenCalled()
    })

    it('should return cached value if already loaded', async () => {
      const cachedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = await ensureTrackedCache(
        cachedSet,
        true, // enabled
        mockDbService as unknown as DatabaseService,
        mockLogger,
      )

      expect(result).toBe(cachedSet)
      expect(mockDbService.getTrackedContentGuids).not.toHaveBeenCalled()
    })

    it('should load tracked GUIDs from database when cache is null', async () => {
      const guidSet = new Set(['tmdb://11111', 'tmdb://22222', 'imdb://tt123'])
      vi.mocked(mockDbService.getTrackedContentGuids).mockResolvedValue(guidSet)

      const result = await ensureTrackedCache(
        null, // no cache
        true, // enabled
        mockDbService as unknown as DatabaseService,
        mockLogger,
      )

      expect(result).toEqual(guidSet)
      expect(mockDbService.getTrackedContentGuids).toHaveBeenCalledOnce()
    })

    it('should handle empty guid set from database', async () => {
      const emptySet = new Set<string>()
      vi.mocked(mockDbService.getTrackedContentGuids).mockResolvedValue(
        emptySet,
      )

      const result = await ensureTrackedCache(
        null,
        true,
        mockDbService as unknown as DatabaseService,
        mockLogger,
      )

      expect(result).toEqual(emptySet)
    })

    it('should throw and log error on database failure', async () => {
      const error = new Error('Database connection failed')
      vi.mocked(mockDbService.getTrackedContentGuids).mockRejectedValue(error)

      await expect(
        ensureTrackedCache(
          null,
          true,
          mockDbService as unknown as DatabaseService,
          mockLogger,
        ),
      ).rejects.toThrow('Database connection failed')
    })

    it('should not load when tracked-only is disabled even with null cache', async () => {
      const result = await ensureTrackedCache(
        null,
        false, // disabled
        mockDbService as unknown as DatabaseService,
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockDbService.getTrackedContentGuids).not.toHaveBeenCalled()
    })
  })

  describe('isAnyGuidTracked', () => {
    it('should return true when tracked-only is disabled', () => {
      const result = isAnyGuidTracked(
        ['tmdb://12345'],
        null, // no cache
        false, // disabled
      )

      expect(result).toBe(true)
    })

    it('should return true when tracked-only is disabled with cache', () => {
      const trackedSet = new Set(['tmdb://99999'])

      const result = isAnyGuidTracked(
        ['tmdb://12345'],
        trackedSet,
        false, // disabled
      )

      // When disabled, all content is considered tracked
      expect(result).toBe(true)
    })

    it('should return true when GUID is in tracked set', () => {
      const trackedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidTracked(
        ['tmdb://12345'],
        trackedSet,
        true, // enabled
      )

      expect(result).toBe(true)
    })

    it('should return false when GUID is not in tracked set', () => {
      const trackedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidTracked(
        ['tmdb://99999'],
        trackedSet,
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should return true if any GUID in list is tracked', () => {
      const trackedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidTracked(
        ['imdb://tt123', 'tmdb://67890', 'tvdb://999'],
        trackedSet,
        true, // enabled
      )

      expect(result).toBe(true)
    })

    it('should return false when all GUIDs are not tracked', () => {
      const trackedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidTracked(
        ['imdb://tt123', 'tvdb://999'],
        trackedSet,
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should call onHit callback for first matching GUID', () => {
      const trackedSet = new Set(['tmdb://12345', 'tmdb://67890'])
      const onHit = vi.fn()

      const result = isAnyGuidTracked(
        ['tmdb://12345', 'tmdb://67890'],
        trackedSet,
        true,
        onHit,
      )

      expect(result).toBe(true)
      expect(onHit).toHaveBeenCalledOnce()
      expect(onHit).toHaveBeenCalledWith('tmdb://12345')
    })

    it('should not call onHit when no GUID matches', () => {
      const trackedSet = new Set(['tmdb://12345'])
      const onHit = vi.fn()

      const result = isAnyGuidTracked(['tmdb://99999'], trackedSet, true, onHit)

      expect(result).toBe(false)
      expect(onHit).not.toHaveBeenCalled()
    })

    it('should handle empty GUID list', () => {
      const trackedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidTracked([], trackedSet, true)

      expect(result).toBe(false)
    })

    it('should handle empty tracked set', () => {
      const trackedSet = new Set<string>()

      const result = isAnyGuidTracked(['tmdb://12345'], trackedSet, true)

      expect(result).toBe(false)
    })

    it('should return false when cache is null and tracked-only is enabled (fail-safe)', () => {
      // Fail-safe behavior: if tracked-only is enabled but cache is null,
      // block deletion to prevent removing content when tracking data is unavailable
      const result = isAnyGuidTracked(
        ['tmdb://12345'],
        null, // no cache
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should handle onHit being undefined', () => {
      const trackedSet = new Set(['tmdb://12345'])

      // Should not throw
      expect(() => {
        isAnyGuidTracked(['tmdb://12345'], trackedSet, true, undefined)
      }).not.toThrow()
    })

    it('should stop at first match and not check remaining GUIDs', () => {
      const trackedSet = new Set(['tmdb://second'])
      const onHit = vi.fn()

      isAnyGuidTracked(
        ['tmdb://first', 'tmdb://second', 'tmdb://third'],
        trackedSet,
        true,
        onHit,
      )

      // Should only be called once for the first match
      expect(onHit).toHaveBeenCalledOnce()
      expect(onHit).toHaveBeenCalledWith('tmdb://second')
    })
  })
})
