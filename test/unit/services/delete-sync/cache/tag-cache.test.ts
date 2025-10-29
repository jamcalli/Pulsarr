import {
  TagCache,
  type TagService,
} from '@services/delete-sync/cache/tag-cache.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('tag-cache', () => {
  let tagCache: TagCache
  let mockService: TagService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    tagCache = new TagCache()
    mockService = {
      getTags: vi.fn(),
    }
    mockLogger = createMockLogger()
  })

  describe('getTagsForInstance', () => {
    it('should fetch and cache tags on first call', async () => {
      const mockTags = [
        { id: 1, label: 'user-john' },
        { id: 2, label: 'removed' },
        { id: 3, label: 'hd' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(mockService.getTags).toHaveBeenCalledOnce()
      expect(result).toBeInstanceOf(Map)
      expect(result.get(1)).toBe('user-john')
      expect(result.get(2)).toBe('removed')
      expect(result.get(3)).toBe('hd')
    })

    it('should return cached tags on second call', async () => {
      const mockTags = [
        { id: 1, label: 'user-john' },
        { id: 2, label: 'removed' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      // First call
      const result1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Second call
      const result2 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Should only fetch once
      expect(mockService.getTags).toHaveBeenCalledOnce()

      // Both results should be the same cached map
      expect(result1).toBe(result2)
      expect(result1.get(1)).toBe('user-john')
      expect(result2.get(1)).toBe('user-john')
    })

    it('should normalize tag labels (trim and lowercase)', async () => {
      const mockTags = [
        { id: 1, label: '  USER-JOHN  ' },
        { id: 2, label: 'REMOVED' },
        { id: 3, label: '  HD  ' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(result.get(1)).toBe('user-john') // trimmed and lowercase
      expect(result.get(2)).toBe('removed') // lowercase
      expect(result.get(3)).toBe('hd') // trimmed and lowercase
    })

    it('should use separate cache keys for different instance types', async () => {
      const radarrTags = [{ id: 1, label: 'radarr-tag' }]
      const sonarrTags = [{ id: 1, label: 'sonarr-tag' }]

      vi.mocked(mockService.getTags)
        .mockResolvedValueOnce(radarrTags)
        .mockResolvedValueOnce(sonarrTags)

      // Fetch for Radarr instance 1
      const radarrResult = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Fetch for Sonarr instance 1
      const sonarrResult = await tagCache.getTagsForInstance(
        1,
        mockService,
        'sonarr',
        mockLogger,
      )

      // Should have been called twice (different instance types)
      expect(mockService.getTags).toHaveBeenCalledTimes(2)

      // Different tags for each
      expect(radarrResult.get(1)).toBe('radarr-tag')
      expect(sonarrResult.get(1)).toBe('sonarr-tag')
    })

    it('should use separate cache keys for different instance IDs', async () => {
      const instance1Tags = [{ id: 1, label: 'instance-1-tag' }]
      const instance2Tags = [{ id: 1, label: 'instance-2-tag' }]

      vi.mocked(mockService.getTags)
        .mockResolvedValueOnce(instance1Tags)
        .mockResolvedValueOnce(instance2Tags)

      // Fetch for instance 1
      const result1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Fetch for instance 2
      const result2 = await tagCache.getTagsForInstance(
        2,
        mockService,
        'radarr',
        mockLogger,
      )

      // Should have been called twice (different instance IDs)
      expect(mockService.getTags).toHaveBeenCalledTimes(2)

      // Different tags for each
      expect(result1.get(1)).toBe('instance-1-tag')
      expect(result2.get(1)).toBe('instance-2-tag')
    })

    it('should handle empty tag list', async () => {
      vi.mocked(mockService.getTags).mockResolvedValue([])

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('should return empty map on error', async () => {
      const error = new Error('API connection failed')
      vi.mocked(mockService.getTags).mockRejectedValue(error)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Critical error fetching tags for radarr instance 1 - this may affect deletion accuracy',
      )
    })

    it('should not cache error results', async () => {
      const error = new Error('API connection failed')
      vi.mocked(mockService.getTags)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce([{ id: 1, label: 'recovered-tag' }])

      // First call fails
      const result1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )
      expect(result1.size).toBe(0)

      // Second call should try again (error not cached)
      const result2 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Should have been called twice
      expect(mockService.getTags).toHaveBeenCalledTimes(2)

      // Second call should succeed
      expect(result2.size).toBe(1)
      expect(result2.get(1)).toBe('recovered-tag')
    })

    it('should log error with instance type and ID', async () => {
      const error = new Error('Network timeout')
      vi.mocked(mockService.getTags).mockRejectedValue(error)

      await tagCache.getTagsForInstance(5, mockService, 'sonarr', mockLogger)

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Critical error fetching tags for sonarr instance 5 - this may affect deletion accuracy',
      )
    })

    it('should handle tags with special characters in labels', async () => {
      const mockTags = [
        { id: 1, label: 'user:john-123' },
        { id: 2, label: 'tag.with.dots' },
        { id: 3, label: 'tag-with-hyphens' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(result.get(1)).toBe('user:john-123')
      expect(result.get(2)).toBe('tag.with.dots')
      expect(result.get(3)).toBe('tag-with-hyphens')
    })

    it('should handle duplicate tag IDs (last one wins)', async () => {
      const mockTags = [
        { id: 1, label: 'first' },
        { id: 1, label: 'second' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      // Map constructor will use the last value for duplicate keys
      expect(result.get(1)).toBe('second')
      expect(result.size).toBe(1)
    })

    it('should handle very large tag ID numbers', async () => {
      const mockTags = [
        { id: 999999, label: 'large-id-tag' },
        { id: 1, label: 'small-id-tag' },
      ]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      const result = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )

      expect(result.get(999999)).toBe('large-id-tag')
      expect(result.get(1)).toBe('small-id-tag')
    })
  })

  describe('clear', () => {
    it('should clear all cached tags', async () => {
      const mockTags = [{ id: 1, label: 'cached-tag' }]
      vi.mocked(mockService.getTags).mockResolvedValue(mockTags)

      // Fetch and cache tags
      await tagCache.getTagsForInstance(1, mockService, 'radarr', mockLogger)
      await tagCache.getTagsForInstance(2, mockService, 'radarr', mockLogger)
      await tagCache.getTagsForInstance(1, mockService, 'sonarr', mockLogger)

      // Should have been called 3 times (3 different cache keys)
      expect(mockService.getTags).toHaveBeenCalledTimes(3)

      // Clear the cache
      tagCache.clear()

      // Fetch again - should call API again since cache is cleared
      await tagCache.getTagsForInstance(1, mockService, 'radarr', mockLogger)

      // Should have been called 4 times now (cache was cleared)
      expect(mockService.getTags).toHaveBeenCalledTimes(4)
    })

    it('should allow cache to be rebuilt after clearing', async () => {
      const firstTags = [{ id: 1, label: 'first-run' }]
      const secondTags = [{ id: 1, label: 'second-run' }]

      vi.mocked(mockService.getTags)
        .mockResolvedValueOnce(firstTags)
        .mockResolvedValueOnce(secondTags)

      // First fetch
      const result1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )
      expect(result1.get(1)).toBe('first-run')

      // Clear cache
      tagCache.clear()

      // Second fetch
      const result2 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )
      expect(result2.get(1)).toBe('second-run')

      // Should have been called twice (cache was cleared between)
      expect(mockService.getTags).toHaveBeenCalledTimes(2)
    })

    it('should not throw error when clearing empty cache', () => {
      expect(() => {
        tagCache.clear()
      }).not.toThrow()
    })
  })

  describe('cache isolation', () => {
    it('should maintain separate caches for multiple instances', async () => {
      const radarr1Tags = [{ id: 1, label: 'radarr-1' }]
      const radarr2Tags = [{ id: 2, label: 'radarr-2' }]
      const sonarr1Tags = [{ id: 3, label: 'sonarr-1' }]

      vi.mocked(mockService.getTags)
        .mockResolvedValueOnce(radarr1Tags)
        .mockResolvedValueOnce(radarr2Tags)
        .mockResolvedValueOnce(sonarr1Tags)

      // Fetch all
      const r1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'radarr',
        mockLogger,
      )
      const r2 = await tagCache.getTagsForInstance(
        2,
        mockService,
        'radarr',
        mockLogger,
      )
      const s1 = await tagCache.getTagsForInstance(
        1,
        mockService,
        'sonarr',
        mockLogger,
      )

      // Each should have their own tags
      expect(r1.get(1)).toBe('radarr-1')
      expect(r2.get(2)).toBe('radarr-2')
      expect(s1.get(3)).toBe('sonarr-1')

      // Fetch again - should use cache
      await tagCache.getTagsForInstance(1, mockService, 'radarr', mockLogger)
      await tagCache.getTagsForInstance(2, mockService, 'radarr', mockLogger)
      await tagCache.getTagsForInstance(1, mockService, 'sonarr', mockLogger)

      // Should only have been called 3 times (all cached)
      expect(mockService.getTags).toHaveBeenCalledTimes(3)
    })
  })

  describe('getCompiledRegex', () => {
    it('should compile and return a regex on first call', () => {
      const pattern = 'user-.*'
      const regex = tagCache.getCompiledRegex(pattern)

      expect(regex).toBeInstanceOf(RegExp)
      expect(regex.test('user-john')).toBe(true)
      expect(regex.test('admin-john')).toBe(false)
    })

    it('should return cached regex on subsequent calls with same pattern', () => {
      const pattern = 'user-.*'

      const regex1 = tagCache.getCompiledRegex(pattern)
      const regex2 = tagCache.getCompiledRegex(pattern)

      // Should be the exact same object (cached)
      expect(regex1).toBe(regex2)
    })

    it('should compile new regex when pattern changes', () => {
      const pattern1 = 'user-.*'
      const pattern2 = 'admin-.*'

      const regex1 = tagCache.getCompiledRegex(pattern1)
      const regex2 = tagCache.getCompiledRegex(pattern2)

      // Should be different objects
      expect(regex1).not.toBe(regex2)

      // Should match different patterns
      expect(regex1.test('user-john')).toBe(true)
      expect(regex1.test('admin-john')).toBe(false)

      expect(regex2.test('admin-john')).toBe(true)
      expect(regex2.test('user-john')).toBe(false)
    })

    it('should clear regex cache when clear() is called', () => {
      const pattern = 'user-.*'

      const regex1 = tagCache.getCompiledRegex(pattern)

      // Clear cache
      tagCache.clear()

      const regex2 = tagCache.getCompiledRegex(pattern)

      // Should be different objects (not cached)
      expect(regex1).not.toBe(regex2)

      // But should match the same pattern
      expect(regex1.test('user-john')).toBe(true)
      expect(regex2.test('user-john')).toBe(true)
    })

    it('should handle complex regex patterns', () => {
      const pattern = '^user-[a-z]+-\\d+$'
      const regex = tagCache.getCompiledRegex(pattern)

      expect(regex.test('user-john-123')).toBe(true)
      expect(regex.test('user-jane-456')).toBe(true)
      expect(regex.test('user-john')).toBe(false) // missing number
      expect(regex.test('admin-john-123')).toBe(false) // wrong prefix
    })

    it('should compile regex with case-insensitive and unicode flags', () => {
      // Regex is compiled with 'iu' flags to match lowercased tags and support Unicode
      const pattern = 'USER'
      const regex = tagCache.getCompiledRegex(pattern)

      expect(regex.test('USER')).toBe(true)
      expect(regex.test('user')).toBe(true) // Case-insensitive due to 'i' flag
      expect(regex.test('UsEr')).toBe(true) // Case-insensitive
    })

    it('should handle special regex characters', () => {
      const pattern = 'user\\.tag'
      const regex = tagCache.getCompiledRegex(pattern)

      expect(regex.test('user.tag')).toBe(true)
      expect(regex.test('userXtag')).toBe(false)
    })

    it('should update cache when switching back to previous pattern', () => {
      const pattern1 = 'user-.*'
      const pattern2 = 'admin-.*'

      // First call with pattern1
      const regex1a = tagCache.getCompiledRegex(pattern1)

      // Switch to pattern2
      const _regex2 = tagCache.getCompiledRegex(pattern2)

      // Switch back to pattern1
      const regex1b = tagCache.getCompiledRegex(pattern1)

      // Should compile new regex (not cached from first call)
      expect(regex1a).not.toBe(regex1b)

      // But should match the same pattern
      expect(regex1a.test('user-john')).toBe(true)
      expect(regex1b.test('user-john')).toBe(true)
    })
  })
})
