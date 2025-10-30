import type { TagCache, TagService } from '@services/delete-sync/cache/index.js'
import {
  type ContentValidators,
  type ValidationConfig,
  validateTagBasedDeletion,
  validateWatchlistDeletion,
} from '@services/delete-sync/validation/content-validator.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Mock the tag operations module
vi.mock('@services/delete-sync/tag-operations/index.js', () => ({
  hasRemovalTag: vi.fn(),
  hasTagMatchingRegex: vi.fn(),
}))

import {
  hasRemovalTag,
  hasTagMatchingRegex,
} from '@services/delete-sync/tag-operations/index.js'

describe('content-validator', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockValidators: ContentValidators

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockValidators = {
      isAnyGuidTracked: vi.fn(() => true),
      isAnyGuidProtected: vi.fn(() => false),
    }
    vi.clearAllMocks()
  })

  describe('validateWatchlistDeletion', () => {
    it('should skip items that are in watchlist', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(['tmdb://12345', 'tmdb://67890']),
      }

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.protected).toBe(false)
      expect(result.reason).toBe('in-watchlist')
    })

    it('should allow deletion for items not in watchlist', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(['tmdb://12345']),
      }

      const result = validateWatchlistDeletion(
        ['tmdb://99999'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(false)
      expect(result.protected).toBe(false)
    })

    it('should skip non-tracked items when tracked-only is enabled', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(),
      }

      mockValidators.isAnyGuidTracked = vi.fn(() => false)

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.protected).toBe(false)
      expect(result.notTracked).toBe(true)
    })

    it('should allow deletion for tracked items when tracked-only is enabled', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(),
      }

      mockValidators.isAnyGuidTracked = vi.fn(() => true)

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(false)
      expect(result.protected).toBe(false)
    })

    it('should mark protected items', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: true,
        watchlistGuids: new Set(),
      }

      mockValidators.isAnyGuidProtected = vi.fn(() => true)

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(false)
      expect(result.protected).toBe(true)
    })

    it('should not check protection when disabled', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(),
      }

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(mockValidators.isAnyGuidProtected).not.toHaveBeenCalled()
      expect(result.protected).toBe(false)
    })

    it('should check multiple GUIDs against watchlist', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(['tmdb://12345']),
      }

      // First GUID not in watchlist, but second one is
      const result = validateWatchlistDeletion(
        ['imdb://tt123', 'tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.reason).toBe('in-watchlist')
    })

    it('should call onHit callback when guid is tracked', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(),
      }

      const guidToFind = 'tmdb://12345'
      let _hitGuid: string | undefined

      mockValidators.isAnyGuidTracked = vi.fn((guids, onHit) => {
        if (onHit && guids.includes(guidToFind)) {
          onHit(guidToFind)
        }
        return true
      })

      validateWatchlistDeletion(
        [guidToFind],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      expect(mockValidators.isAnyGuidTracked).toHaveBeenCalled()
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should prioritize watchlist check over tracked check', () => {
      const config: ValidationConfig = {
        deletionMode: 'watchlist',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: false,
        watchlistGuids: new Set(['tmdb://12345']),
      }

      mockValidators.isAnyGuidTracked = vi.fn(() => false)

      const result = validateWatchlistDeletion(
        ['tmdb://12345'],
        'Test Movie',
        config,
        mockValidators,
        mockLogger,
        null,
      )

      // Should skip because in watchlist, not because it's not tracked
      expect(result.skip).toBe(true)
      expect(result.reason).toBe('in-watchlist')
      expect(result.notTracked).toBeUndefined()
      expect(mockValidators.isAnyGuidTracked).not.toHaveBeenCalled()
    })
  })

  describe('validateTagBasedDeletion', () => {
    let mockTagCache: TagCache
    let mockService: TagService

    beforeEach(() => {
      mockTagCache = {
        getTagsForInstance: vi.fn(),
        clear: vi.fn(),
      } as unknown as TagCache
      mockService = {} as TagService
    })

    it('should skip items without removal tag', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(false)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
      }

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1, 2, 3],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.protected).toBe(false)
      expect(result.reason).toBe('no-removal-tag')
    })

    it('should skip items without required tag regex match', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(false)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-.*',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
      }

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1, 2, 3],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.protected).toBe(false)
      expect(result.reason).toBe('no-required-tag')
    })

    it('should skip non-tracked items when tracked-only is enabled', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: false,
      }

      mockValidators.isAnyGuidTracked = vi.fn(() => false)

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1, 2, 3],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(true)
      expect(result.protected).toBe(false)
      expect(result.notTracked).toBe(true)
    })

    it('should mark protected items', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: true,
      }

      mockValidators.isAnyGuidProtected = vi.fn(() => true)

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1, 2, 3],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(false)
      expect(result.protected).toBe(true)
    })

    it('should allow deletion when all checks pass', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
      }

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1, 2, 3],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(result.skip).toBe(false)
      expect(result.protected).toBe(false)
    })

    it('should pass correct parameters to hasRemovalTag', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(false)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'my-removed-tag',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
      }

      await validateTagBasedDeletion(
        5,
        mockService,
        [10, 20, 30],
        ['tmdb://12345'],
        'Test Movie',
        'sonarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(hasRemovalTag).toHaveBeenCalledWith(
        5,
        mockService,
        [10, 20, 30],
        'sonarr',
        'my-removed-tag',
        mockTagCache,
        mockLogger,
      )
    })

    it('should pass correct parameters to hasTagMatchingRegex', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-[a-z]+',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
      }

      await validateTagBasedDeletion(
        7,
        mockService,
        [5, 6, 7],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      expect(hasTagMatchingRegex).toHaveBeenCalledWith(
        7,
        mockService,
        [5, 6, 7],
        'radarr',
        'user-[a-z]+',
        mockTagCache,
        mockLogger,
      )
    })

    it('should not check regex when not configured', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: false,
        enablePlexPlaylistProtection: false,
        // No deleteSyncRequiredTagRegex
      }

      await validateTagBasedDeletion(
        1,
        mockService,
        [1],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      // hasTagMatchingRegex should still be called but will return true
      // when no regex is configured (this is tested in tag-matcher tests)
      expect(hasTagMatchingRegex).toHaveBeenCalled()
    })

    it('should check tracked status before protection', async () => {
      vi.mocked(hasRemovalTag).mockResolvedValue(true)
      vi.mocked(hasTagMatchingRegex).mockResolvedValue(true)

      const config: ValidationConfig = {
        deletionMode: 'tag-based',
        removedTagPrefix: 'removed',
        deleteSyncTrackedOnly: true,
        enablePlexPlaylistProtection: true,
      }

      mockValidators.isAnyGuidTracked = vi.fn(() => false)
      mockValidators.isAnyGuidProtected = vi.fn(() => true)

      const result = await validateTagBasedDeletion(
        1,
        mockService,
        [1],
        ['tmdb://12345'],
        'Test Movie',
        'radarr',
        config,
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )

      // Should skip due to not tracked, before checking protection
      expect(result.skip).toBe(true)
      expect(result.notTracked).toBe(true)
      expect(mockValidators.isAnyGuidProtected).not.toHaveBeenCalled()
    })
  })
})
