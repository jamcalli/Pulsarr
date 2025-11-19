import type { RadarrMovieWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexMetadata } from '@root/types/plex-server.types.js'
import type { RadarrMovie } from '@root/types/radarr.types.js'
import {
  buildRadarrMatchingCache,
  clearRadarrMatchingCache,
  matchPlexMovieToRadarr,
} from '@services/plex-label-sync/matching/radarr-matcher.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Helper to create minimal PlexMetadata with Media for radarr matching
function createMockPlexMetadataWithMedia(
  filePaths: Array<string | undefined>,
): PlexMetadata {
  return {
    ratingKey: '123',
    key: '/library/metadata/123',
    guid: 'plex://movie/123',
    type: 'movie',
    title: 'Test Movie',
    Media: filePaths.map((file) => ({
      Part: file !== undefined ? [{ file }] : [],
    })),
  }
}

// Helper to create minimal RadarrMovie for testing
function createMockRadarrMovie(
  id: number,
  title: string,
  filePath: string | null | undefined,
): RadarrMovie {
  const movie: RadarrMovie = {
    id,
    title,
    tmdbId: 12345,
  }

  if (filePath !== undefined && filePath !== null) {
    movie.movieFile = {
      id: 1,
      movieId: id,
      relativePath: filePath,
      path: filePath,
      size: 1000000,
      dateAdded: '2024-01-01T00:00:00Z',
    }
  } else if (filePath === null) {
    movie.movieFile = {
      id: 1,
      movieId: id,
      relativePath: '',
      path: null as unknown as string,
      size: 1000000,
      dateAdded: '2024-01-01T00:00:00Z',
    }
  }

  return movie
}

describe('radarr-matcher', () => {
  let mockPlexServer: PlexServerService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
    } as unknown as PlexServerService
  })

  afterEach(() => {
    clearRadarrMatchingCache()
  })

  describe('matchPlexMovieToRadarr', () => {
    it('should match Plex movie to Radarr movie by exact file path', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          instanceId: 1,
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie (2023)/Test Movie.mkv',
          ),
          tags: ['action'],
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia([
          '/movies/Test Movie (2023)/Test Movie.mkv',
        ]),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[0])
      expect(mockPlexServer.getMetadata).toHaveBeenCalledWith('123')
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          plexTitle: 'Test Movie',
          radarrTitle: 'Test Movie',
          filePath: '/movies/Test Movie (2023)/Test Movie.mkv',
        }),
        'Found exact file path match',
      )
    })

    it('should match with normalized paths (cross-platform)', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          instanceId: 1,
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie/file.mkv',
          ),
          tags: ['action'],
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      // Plex returns Windows-style path
      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['\\movies\\Test Movie\\file.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[0])
    })

    it('should return null when Plex metadata has no Media', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue({
        ratingKey: '123',
        key: '/library/metadata/123',
        guid: 'plex://movie/123',
        type: 'movie',
        title: 'Test Movie',
        Media: undefined,
      })

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          ratingKey: '123',
          title: 'Test Movie',
        }),
        'No media information found for Plex movie',
      )
    })

    it('should return null when Plex metadata is null', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = []

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(null)

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toBeNull()
    })

    it('should return null when no Radarr movies match', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Different Movie',
            '/movies/Different Movie.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          ratingKey: '123',
          title: 'Test Movie',
          plexFilePaths: ['/movies/Test Movie.mkv'],
        }),
        'No Radarr match found for Plex movie',
      )
    })

    it('should skip Radarr movies without movieFile', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(1, 'Movie Without File', undefined),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
        {
          movie: createMockRadarrMovie(
            2,
            'Test Movie',
            '/movies/Test Movie.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[1])
    })

    it('should skip Radarr movies with null movieFile path', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(1, 'Movie With Null Path', null),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
        {
          movie: createMockRadarrMovie(
            2,
            'Test Movie',
            '/movies/Test Movie.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[1])
    })

    it('should handle Plex movie with multiple media parts', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie Part 2',
            '/movies/Test Movie-part2.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia([
          '/movies/Test Movie-part1.mkv',
          '/movies/Test Movie-part2.mkv',
        ]),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[0])
    })

    it('should handle Plex movie with multiple media items', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie-4K.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia([
          '/movies/Test Movie-HD.mkv',
          '/movies/Test Movie-4K.mkv',
        ]),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[0])
    })

    it('should handle Media part without file property', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie.mkv',
          ),
          tags: [],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia([undefined, '/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toEqual(radarrMovies[0])
    })

    it('should return last matching Radarr movie when multiple have same path', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie Instance 1',
            '/movies/Test Movie.mkv',
          ),
          tags: ['radarr1'],
          instanceId: 1,
          instanceName: 'radarr-1',
        },
        {
          movie: createMockRadarrMovie(
            2,
            'Test Movie Instance 2',
            '/movies/Test Movie.mkv',
          ),
          tags: ['radarr2'],
          instanceId: 2,
          instanceName: 'radarr-2',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      // With Map-based caching, the last entry with the same path wins
      expect(result).toEqual(radarrMovies[1])
    })

    it('should handle error when getting metadata', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = []

      vi.mocked(mockPlexServer.getMetadata).mockRejectedValue(
        new Error('Network error'),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toBeNull()
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error matching Plex movie to Radarr:',
      )
    })

    it('should handle empty radarrMovies array', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = []

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      const result = await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(result).toBeNull()
    })

    it('should log debug information during matching', async () => {
      const plexItem = {
        ratingKey: '123',
        title: 'Test Movie',
      }

      const radarrMovies: RadarrMovieWithTags[] = [
        {
          movie: createMockRadarrMovie(
            1,
            'Test Movie',
            '/movies/Test Movie.mkv',
          ),
          tags: ['action', 'hd'],
          instanceId: 1,
          instanceName: 'radarr-main',
        },
      ]

      buildRadarrMatchingCache(radarrMovies)

      vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
        createMockPlexMetadataWithMedia(['/movies/Test Movie.mkv']),
      )

      await matchPlexMovieToRadarr(
        plexItem,
        radarrMovies,
        mockPlexServer,
        mockLogger,
      )

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          ratingKey: '123',
          title: 'Test Movie',
          plexFilePaths: ['/movies/Test Movie.mkv'],
          radarrMovieCount: 1,
        }),
        'Matching Plex movie to Radarr',
      )

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          plexTitle: 'Test Movie',
          radarrTitle: 'Test Movie',
          filePath: '/movies/Test Movie.mkv',
          instanceName: 'radarr-main',
          tags: ['action', 'hd'],
        }),
        'Found exact file path match',
      )
    })
  })
})
