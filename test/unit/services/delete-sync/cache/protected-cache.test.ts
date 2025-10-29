import {
  ensureProtectionCache,
  isAnyGuidProtected,
} from '@services/delete-sync/cache/protected-cache.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('protected-cache', () => {
  let mockFastify: Partial<FastifyInstance>
  let mockPlexServerService: {
    isInitialized: ReturnType<typeof vi.fn>
    getOrCreateProtectionPlaylists: ReturnType<typeof vi.fn>
    getProtectedItems: ReturnType<typeof vi.fn>
  }
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServerService = {
      isInitialized: vi.fn(),
      getOrCreateProtectionPlaylists: vi.fn(),
      getProtectedItems: vi.fn(),
    }
    mockFastify = {
      plexServerService: mockPlexServerService,
    } as unknown as FastifyInstance
  })

  describe('ensureProtectionCache', () => {
    it('should return null when protection is disabled', async () => {
      const result = await ensureProtectionCache(
        null,
        false, // disabled
        mockFastify as FastifyInstance,
        'Protected',
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockPlexServerService.isInitialized).not.toHaveBeenCalled()
    })

    it('should return cached value if already loaded', async () => {
      const cachedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = await ensureProtectionCache(
        cachedSet,
        true, // enabled
        mockFastify as FastifyInstance,
        'Protected',
        mockLogger,
      )

      expect(result).toBe(cachedSet)
      expect(mockPlexServerService.isInitialized).not.toHaveBeenCalled()
    })

    it('should throw error when Plex server is not initialized', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(false)

      await expect(
        ensureProtectionCache(
          null, // no cache
          true, // enabled
          mockFastify as FastifyInstance,
          'Protected',
          mockLogger,
        ),
      ).rejects.toThrow(
        'Plex server not initialized for protection playlist access',
      )

      expect(mockPlexServerService.isInitialized).toHaveBeenCalledOnce()
    })

    it('should load protected GUIDs from Plex playlists', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(true)

      const playlistMap = new Map([
        ['user1', 'playlist-key-1'],
        ['user2', 'playlist-key-2'],
      ])
      mockPlexServerService.getOrCreateProtectionPlaylists.mockResolvedValue(
        playlistMap,
      )

      const protectedGuids = new Set([
        'tmdb://11111',
        'tmdb://22222',
        'imdb://tt123',
      ])
      mockPlexServerService.getProtectedItems.mockResolvedValue(protectedGuids)

      const result = await ensureProtectionCache(
        null, // no cache
        true, // enabled
        mockFastify as FastifyInstance,
        'Protected',
        mockLogger,
      )

      expect(result).toEqual(protectedGuids)
      expect(mockPlexServerService.isInitialized).toHaveBeenCalledOnce()
      expect(
        mockPlexServerService.getOrCreateProtectionPlaylists,
      ).toHaveBeenCalledWith(true)
      expect(mockPlexServerService.getProtectedItems).toHaveBeenCalledOnce()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Loading protection playlists and caching results...',
      )
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cached 3 protected item GUIDs from 2 user playlists',
      )
    })

    it('should handle empty protected GUIDs set', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(true)

      const playlistMap = new Map([['user1', 'playlist-key-1']])
      mockPlexServerService.getOrCreateProtectionPlaylists.mockResolvedValue(
        playlistMap,
      )

      const emptySet = new Set<string>()
      mockPlexServerService.getProtectedItems.mockResolvedValue(emptySet)

      const result = await ensureProtectionCache(
        null,
        true,
        mockFastify as FastifyInstance,
        'Protected',
        mockLogger,
      )

      expect(result).toEqual(emptySet)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cached 0 protected item GUIDs from 1 user playlists',
      )
    })

    it('should throw error when no playlists found', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(true)

      const emptyPlaylistMap = new Map()
      mockPlexServerService.getOrCreateProtectionPlaylists.mockResolvedValue(
        emptyPlaylistMap,
      )

      await expect(
        ensureProtectionCache(
          null,
          true,
          mockFastify as FastifyInstance,
          'My Protection Playlist',
          mockLogger,
        ),
      ).rejects.toThrow(
        'Could not find or create protection playlists "My Protection Playlist" for any users - Plex server may be unreachable',
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error loading protection playlists for caching',
      )
    })

    it('should throw error when getProtectedItems returns null', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(true)

      const playlistMap = new Map([['user1', 'playlist-key-1']])
      mockPlexServerService.getOrCreateProtectionPlaylists.mockResolvedValue(
        playlistMap,
      )

      mockPlexServerService.getProtectedItems.mockResolvedValue(null)

      await expect(
        ensureProtectionCache(
          null,
          true,
          mockFastify as FastifyInstance,
          'Protected',
          mockLogger,
        ),
      ).rejects.toThrow('Failed to retrieve protected items from playlists')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error loading protection playlists for caching',
      )
    })

    it('should throw and log error on playlist loading failure', async () => {
      mockPlexServerService.isInitialized.mockReturnValue(true)

      const error = new Error('Plex server unreachable')
      mockPlexServerService.getOrCreateProtectionPlaylists.mockRejectedValue(
        error,
      )

      await expect(
        ensureProtectionCache(
          null,
          true,
          mockFastify as FastifyInstance,
          'Protected',
          mockLogger,
        ),
      ).rejects.toThrow('Plex server unreachable')

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Error loading protection playlists for caching',
      )
    })
  })

  describe('isAnyGuidProtected', () => {
    it('should return false when protection is disabled', () => {
      const protectedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidProtected(
        ['tmdb://12345'],
        protectedSet,
        false, // disabled
      )

      expect(result).toBe(false)
    })

    it('should return false when protected set is null', () => {
      const result = isAnyGuidProtected(
        ['tmdb://12345'],
        null, // no cache
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should return true when GUID is in protected set', () => {
      const protectedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidProtected(
        ['tmdb://12345'],
        protectedSet,
        true, // enabled
      )

      expect(result).toBe(true)
    })

    it('should return false when GUID is not in protected set', () => {
      const protectedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidProtected(
        ['tmdb://99999'],
        protectedSet,
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should return true if any GUID in list is protected', () => {
      const protectedSet = new Set(['tmdb://12345', 'tmdb://67890'])

      const result = isAnyGuidProtected(
        ['imdb://tt123', 'tmdb://67890', 'tvdb://999'],
        protectedSet,
        true, // enabled
      )

      expect(result).toBe(true)
    })

    it('should return false when all GUIDs are not protected', () => {
      const protectedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidProtected(
        ['imdb://tt123', 'tvdb://999'],
        protectedSet,
        true, // enabled
      )

      expect(result).toBe(false)
    })

    it('should call onHit callback for first matching GUID', () => {
      const protectedSet = new Set(['tmdb://12345', 'tmdb://67890'])
      const onHit = vi.fn()

      const result = isAnyGuidProtected(
        ['tmdb://12345', 'tmdb://67890'],
        protectedSet,
        true,
        onHit,
      )

      expect(result).toBe(true)
      expect(onHit).toHaveBeenCalledOnce()
      expect(onHit).toHaveBeenCalledWith('tmdb://12345')
    })

    it('should not call onHit when no GUID matches', () => {
      const protectedSet = new Set(['tmdb://12345'])
      const onHit = vi.fn()

      const result = isAnyGuidProtected(
        ['tmdb://99999'],
        protectedSet,
        true,
        onHit,
      )

      expect(result).toBe(false)
      expect(onHit).not.toHaveBeenCalled()
    })

    it('should handle empty GUID list', () => {
      const protectedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidProtected([], protectedSet, true)

      expect(result).toBe(false)
    })

    it('should handle empty protected set', () => {
      const protectedSet = new Set<string>()

      const result = isAnyGuidProtected(['tmdb://12345'], protectedSet, true)

      expect(result).toBe(false)
    })

    it('should handle onHit being undefined', () => {
      const protectedSet = new Set(['tmdb://12345'])

      // Should not throw
      expect(() => {
        isAnyGuidProtected(['tmdb://12345'], protectedSet, true, undefined)
      }).not.toThrow()
    })

    it('should stop at first match and not check remaining GUIDs', () => {
      const protectedSet = new Set(['tmdb://second'])
      const onHit = vi.fn()

      isAnyGuidProtected(
        ['tmdb://first', 'tmdb://second', 'tmdb://third'],
        protectedSet,
        true,
        onHit,
      )

      // Should only be called once for the first match
      expect(onHit).toHaveBeenCalledOnce()
      expect(onHit).toHaveBeenCalledWith('tmdb://second')
    })

    it('should return false when protection is disabled even with populated cache', () => {
      // Even though cache has GUIDs, protection is disabled
      const protectedSet = new Set(['tmdb://12345'])

      const result = isAnyGuidProtected(
        ['tmdb://12345'],
        protectedSet,
        false, // disabled
      )

      expect(result).toBe(false)
    })
  })
})
