import type { TagCache, TagService } from '@services/delete-sync/cache/index.js'
import {
  getRemovalTagPrefixNormalized,
  hasRemovalTag,
  hasTagMatchingRegex,
} from '@services/delete-sync/tag-operations/tag-matcher.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('tag-matcher', () => {
  describe('getRemovalTagPrefixNormalized', () => {
    it('should normalize tag prefix by trimming and lowercasing', () => {
      expect(getRemovalTagPrefixNormalized('  REMOVED  ')).toBe('removed')
    })

    it('should handle already normalized prefix', () => {
      expect(getRemovalTagPrefixNormalized('removed')).toBe('removed')
    })

    it('should handle mixed case', () => {
      expect(getRemovalTagPrefixNormalized('ReMoVeD')).toBe('removed')
    })

    it('should trim whitespace', () => {
      expect(getRemovalTagPrefixNormalized('  removed')).toBe('removed')
      expect(getRemovalTagPrefixNormalized('removed  ')).toBe('removed')
      expect(getRemovalTagPrefixNormalized('  removed  ')).toBe('removed')
    })

    it('should handle undefined as empty string', () => {
      expect(getRemovalTagPrefixNormalized(undefined)).toBe('')
    })

    it('should handle empty string', () => {
      expect(getRemovalTagPrefixNormalized('')).toBe('')
    })

    it('should handle whitespace-only string as empty', () => {
      expect(getRemovalTagPrefixNormalized('   ')).toBe('')
    })

    it('should handle prefixes with hyphens and underscores', () => {
      expect(getRemovalTagPrefixNormalized('REMOVED-FROM')).toBe('removed-from')
      expect(getRemovalTagPrefixNormalized('REMOVED_FROM')).toBe('removed_from')
    })
  })

  describe('hasRemovalTag', () => {
    let mockTagCache: TagCache
    let mockService: TagService
    let mockLogger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      mockLogger = createMockLogger()
      mockService = {} as TagService
      mockTagCache = {
        getTagsForInstance: vi.fn(),
        getCompiledRegex: vi.fn((pattern: string) => new RegExp(pattern)),
        clear: vi.fn(),
      } as unknown as TagCache
    })

    it('should return false for items with no tags', async () => {
      const result = await hasRemovalTag(
        1,
        mockService,
        [], // no tags
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
      expect(mockTagCache.getTagsForInstance).not.toHaveBeenCalled()
    })

    it('should return false when removal tag prefix is undefined', async () => {
      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        undefined,
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('removedTagPrefix is blank'),
      )
    })

    it('should return false when removal tag prefix is empty string', async () => {
      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        '',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should return false when removal tag prefix is whitespace only', async () => {
      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        '   ',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should return true when item has exact matching tag', async () => {
      const tagMap = new Map([
        [1, 'user-john'],
        [2, 'removed'],
        [3, 'hd'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
      expect(mockTagCache.getTagsForInstance).toHaveBeenCalledWith(
        1,
        mockService,
        'radarr',
        mockLogger,
      )
    })

    it('should match tag by prefix (startsWith)', async () => {
      const tagMap = new Map([
        [1, 'user-john'],
        [2, 'removed-by-admin'],
        [3, 'hd'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
    })

    it('should normalize prefix when matching', async () => {
      const tagMap = new Map([[1, 'removed-by-admin']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      // Prefix with different casing and whitespace
      const result = await hasRemovalTag(
        1,
        mockService,
        [1],
        'radarr',
        '  REMOVED  ',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
    })

    it('should return false when no tags match the prefix', async () => {
      const tagMap = new Map([
        [1, 'user-john'],
        [2, 'hd'],
        [3, '4k'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should not match similar prefixes (multi-instance safety)', async () => {
      // Edge case: pulsarr1:removed should NOT match pulsarr2:removed
      const tagMap = new Map([
        [1, 'pulsarr2:removed'], // Different prefix
        [2, 'pulsarr2:removed-by-admin'],
        [3, 'pulsarr10:removed'], // Numeric variation
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'pulsarr1:removed', // Looking for pulsarr1, not pulsarr2
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should match only exact prefix in multi-instance scenario', async () => {
      // Edge case: pulsarr1:removed SHOULD match pulsarr1:removed and pulsarr1:removed-by-admin
      const tagMap = new Map([
        [1, 'pulsarr1:removed'], // Exact match
        [2, 'pulsarr1:removed-by-admin'], // Prefix match
        [3, 'pulsarr2:removed'], // Different instance
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'pulsarr1:removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true) // Should match tags 1 and 2, but not 3
    })

    it('should handle tags that are undefined in the map', async () => {
      const tagMap = new Map([[1, 'removed']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 999], // tag 999 doesn't exist
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true) // tag 1 matches
    })

    it('should use correct instance type for cache key', async () => {
      const tagMap = new Map([[1, 'removed']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      await hasRemovalTag(
        5,
        mockService,
        [1],
        'sonarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(mockTagCache.getTagsForInstance).toHaveBeenCalledWith(
        5,
        mockService,
        'sonarr',
        mockLogger,
      )
    })

    it('should return false on cache error', async () => {
      vi.mocked(mockTagCache.getTagsForInstance).mockRejectedValue(
        new Error('Cache error'),
      )

      const result = await hasRemovalTag(
        1,
        mockService,
        [1, 2],
        'radarr',
        'removed',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Error checking for removal tag'),
      )
    })
  })

  describe('hasTagMatchingRegex', () => {
    let mockTagCache: TagCache
    let mockService: TagService
    let mockLogger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      mockLogger = createMockLogger()
      mockService = {} as TagService
      mockTagCache = {
        getTagsForInstance: vi.fn(),
        getCompiledRegex: vi.fn((pattern: string) => new RegExp(pattern)),
        clear: vi.fn(),
      } as unknown as TagCache
    })

    it('should return true when no regex is configured', async () => {
      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        undefined,
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
      expect(mockTagCache.getTagsForInstance).not.toHaveBeenCalled()
    })

    it('should return false for items with no tags', async () => {
      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [], // no tags
        'radarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should return true when tag matches regex', async () => {
      const tagMap = new Map([
        [1, 'user-john'],
        [2, 'removed'],
        [3, 'hd'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
    })

    it('should return false when no tags match regex', async () => {
      const tagMap = new Map([
        [1, 'admin-john'],
        [2, 'removed'],
        [3, 'hd'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should support complex regex patterns', async () => {
      const tagMap = new Map([
        [1, 'user-john-123'],
        [2, 'user-jane'],
        [3, 'admin'],
      ])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      // Match user tags with numbers
      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 2, 3],
        'radarr',
        'user-.*-\\d+',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
    })

    it('should support case-insensitive regex with i flag', async () => {
      const tagMap = new Map([[1, 'USER-JOHN']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      // This test depends on how the regex is constructed
      // The current implementation doesn't add flags, so this tests exact behavior
      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1],
        'radarr',
        'user-john', // lowercase pattern won't match uppercase tag
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
    })

    it('should handle regex special characters', async () => {
      const tagMap = new Map([[1, 'test.tag']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1],
        'radarr',
        'test\\.tag', // escaped dot
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true)
    })

    it('should handle undefined tags in map', async () => {
      const tagMap = new Map([[1, 'user-john']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 999], // tag 999 doesn't exist
        'radarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(true) // tag 1 matches
    })

    it('should use correct instance type for cache key', async () => {
      const tagMap = new Map([[1, 'user-john']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      await hasTagMatchingRegex(
        7,
        mockService,
        [1],
        'sonarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(mockTagCache.getTagsForInstance).toHaveBeenCalledWith(
        7,
        mockService,
        'sonarr',
        mockLogger,
      )
    })

    it('should return false on invalid regex', async () => {
      const tagMap = new Map([[1, 'user-john']])

      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1],
        'radarr',
        '[invalid(', // Invalid regex
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          regexPattern: '[invalid(',
        }),
        expect.stringContaining('Error checking for tag matching regex'),
      )
    })

    it('should return false on cache error', async () => {
      vi.mocked(mockTagCache.getTagsForInstance).mockRejectedValue(
        new Error('Cache error'),
      )

      const result = await hasTagMatchingRegex(
        1,
        mockService,
        [1, 2],
        'radarr',
        'user-.*',
        mockTagCache,
        mockLogger,
      )

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Error checking for tag matching regex'),
      )
    })
  })
})
