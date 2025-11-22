import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest'
import { enrichContentMetadata, enrichMovieMetadata, enrichShowMetadata } from '../../../../src/services/content-router/enrichment'
import type { ContentMetadata } from '../../../../src/types/router.types'
import * as tmdbService from '../../../../src/services/tmdb.service'
import * as guidHandler from '../../../../src/utils/guid-handler'

// Mock the dependencies
vi.mock('../../../../src/services/tmdb.service')
vi.mock('../../../../src/utils/guid-handler')

describe('enrichment service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('enrichContentMetadata', () => {
    it('should enrich movie content when type is movie', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345',
        year: 2023,
      }

      const mockTmdbMetadata = {
        details: {
          id: 12345,
          title: 'Test Movie',
          overview: 'A test movie',
          release_date: '2023-01-01',
          vote_average: 8.5,
          vote_count: 1000,
          genres: [{ id: 28, name: 'Action' }],
        },
        watchProviders: {
          results: {},
        },
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('12345')
      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue(mockTmdbMetadata as any)

      const result = await enrichContentMetadata(content)

      expect(result.tmdbMetadata).toEqual(mockTmdbMetadata)
      expect(guidHandler.extractTmdbIdFromGuid).toHaveBeenCalledWith('tmdb://12345')
      expect(tmdbService.getMovieMetadata).toHaveBeenCalledWith('12345')
    })

    it('should enrich show content when type is show', async () => {
      const content: ContentMetadata = {
        title: 'Test Show',
        type: 'show',
        guid: 'tmdb://67890',
        year: 2023,
      }

      const mockTmdbMetadata = {
        details: {
          id: 67890,
          name: 'Test Show',
          overview: 'A test show',
          first_air_date: '2023-01-01',
          vote_average: 8.0,
          vote_count: 500,
          genres: [{ id: 18, name: 'Drama' }],
        },
        watchProviders: {
          results: {},
        },
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('67890')
      vi.mocked(tmdbService.getShowMetadata).mockResolvedValue(mockTmdbMetadata as any)

      const result = await enrichContentMetadata(content)

      expect(result.tmdbMetadata).toEqual(mockTmdbMetadata)
      expect(guidHandler.extractTmdbIdFromGuid).toHaveBeenCalledWith('tmdb://67890')
      expect(tmdbService.getShowMetadata).toHaveBeenCalledWith('67890')
    })

    it('should return content unchanged when type is missing', async () => {
      const content: ContentMetadata = {
        title: 'Test Content',
        guid: 'tmdb://12345',
      }

      const result = await enrichContentMetadata(content)

      expect(result).toEqual(content)
      expect(guidHandler.extractTmdbIdFromGuid).not.toHaveBeenCalled()
      expect(tmdbService.getMovieMetadata).not.toHaveBeenCalled()
      expect(tmdbService.getShowMetadata).not.toHaveBeenCalled()
    })

    it('should return content unchanged when guid is missing', async () => {
      const content: ContentMetadata = {
        title: 'Test Content',
        type: 'movie',
      }

      const result = await enrichContentMetadata(content)

      expect(result).toEqual(content)
      expect(guidHandler.extractTmdbIdFromGuid).not.toHaveBeenCalled()
      expect(tmdbService.getMovieMetadata).not.toHaveBeenCalled()
    })

    it('should return content unchanged when tmdbId extraction fails', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'invalid://guid',
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue(null)

      const result = await enrichContentMetadata(content)

      expect(result).toEqual(content)
      expect(guidHandler.extractTmdbIdFromGuid).toHaveBeenCalledWith('invalid://guid')
      expect(tmdbService.getMovieMetadata).not.toHaveBeenCalled()
    })

    it('should handle TMDB service errors gracefully', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345',
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('12345')
      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('TMDB API error'))

      const result = await enrichContentMetadata(content)

      // Should return content without tmdbMetadata when enrichment fails
      expect(result).toEqual(content)
      expect(result.tmdbMetadata).toBeUndefined()
    })

    it('should return content with existing tmdbMetadata if already enriched', async () => {
      const existingMetadata = {
        details: {
          id: 12345,
          title: 'Test Movie',
        },
      }

      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345',
        tmdbMetadata: existingMetadata as any,
      }

      const result = await enrichContentMetadata(content)

      // Should not call TMDB service if metadata already exists
      expect(result.tmdbMetadata).toEqual(existingMetadata)
      expect(tmdbService.getMovieMetadata).not.toHaveBeenCalled()
    })
  })

  describe('enrichMovieMetadata', () => {
    it('should fetch and return movie metadata successfully', async () => {
      const tmdbId = '12345'
      const mockMetadata = {
        details: {
          id: 12345,
          title: 'Test Movie',
          overview: 'A test movie',
          release_date: '2023-01-01',
          vote_average: 8.5,
          vote_count: 1000,
          genres: [{ id: 28, name: 'Action' }],
          runtime: 120,
          budget: 100000000,
          revenue: 500000000,
        },
        watchProviders: {
          results: {
            US: {
              link: 'https://www.themoviedb.org/movie/12345/watch',
              flatrate: [
                {
                  logo_path: '/logo.jpg',
                  provider_id: 8,
                  provider_name: 'Netflix',
                  display_priority: 1,
                },
              ],
            },
          },
        },
        radarrRatings: {
          imdb: { value: 8.5, votes: 100000 },
          tmdb: { value: 8.0, votes: 5000 },
          metacritic: { value: 85 },
          rottenTomatoes: { value: 90 },
        },
      }

      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toEqual(mockMetadata)
      expect(tmdbService.getMovieMetadata).toHaveBeenCalledWith(tmdbId)
      expect(tmdbService.getMovieMetadata).toHaveBeenCalledTimes(1)
    })

    it('should return undefined when TMDB service throws error', async () => {
      const tmdbId = '12345'

      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('API error'))

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toBeUndefined()
      expect(tmdbService.getMovieMetadata).toHaveBeenCalledWith(tmdbId)
    })

    it('should handle null/undefined tmdbId', async () => {
      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('Invalid ID'))

      const result = await enrichMovieMetadata(null as any)

      expect(result).toBeUndefined()
    })

    it('should handle empty string tmdbId', async () => {
      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('Invalid ID'))

      const result = await enrichMovieMetadata('')

      expect(result).toBeUndefined()
    })

    it('should handle metadata without watch providers', async () => {
      const tmdbId = '12345'
      const mockMetadata = {
        details: {
          id: 12345,
          title: 'Test Movie',
        },
        // watchProviders is undefined
      }

      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toEqual(mockMetadata)
      expect(result?.watchProviders).toBeUndefined()
    })

    it('should handle metadata without ratings', async () => {
      const tmdbId = '12345'
      const mockMetadata = {
        details: {
          id: 12345,
          title: 'Test Movie',
        },
        watchProviders: {
          results: {},
        },
        // radarrRatings is undefined
      }

      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toEqual(mockMetadata)
      expect(result?.radarrRatings).toBeUndefined()
    })
  })

  describe('enrichShowMetadata', () => {
    it('should fetch and return show metadata successfully', async () => {
      const tmdbId = '67890'
      const mockMetadata = {
        details: {
          id: 67890,
          name: 'Test Show',
          overview: 'A test show',
          first_air_date: '2023-01-01',
          vote_average: 8.0,
          vote_count: 500,
          genres: [{ id: 18, name: 'Drama' }],
          number_of_seasons: 3,
          number_of_episodes: 30,
        },
        watchProviders: {
          results: {
            US: {
              link: 'https://www.themoviedb.org/tv/67890/watch',
              flatrate: [
                {
                  logo_path: '/logo.jpg',
                  provider_id: 8,
                  provider_name: 'Netflix',
                  display_priority: 1,
                },
              ],
            },
          },
        },
      }

      vi.mocked(tmdbService.getShowMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichShowMetadata(tmdbId)

      expect(result).toEqual(mockMetadata)
      expect(tmdbService.getShowMetadata).toHaveBeenCalledWith(tmdbId)
      expect(tmdbService.getShowMetadata).toHaveBeenCalledTimes(1)
    })

    it('should return undefined when TMDB service throws error', async () => {
      const tmdbId = '67890'

      vi.mocked(tmdbService.getShowMetadata).mockRejectedValue(new Error('API error'))

      const result = await enrichShowMetadata(tmdbId)

      expect(result).toBeUndefined()
      expect(tmdbService.getShowMetadata).toHaveBeenCalledWith(tmdbId)
    })

    it('should handle null/undefined tmdbId', async () => {
      vi.mocked(tmdbService.getShowMetadata).mockRejectedValue(new Error('Invalid ID'))

      const result = await enrichShowMetadata(null as any)

      expect(result).toBeUndefined()
    })

    it('should handle empty string tmdbId', async () => {
      vi.mocked(tmdbService.getShowMetadata).mockRejectedValue(new Error('Invalid ID'))

      const result = await enrichShowMetadata('')

      expect(result).toBeUndefined()
    })

    it('should handle metadata without watch providers', async () => {
      const tmdbId = '67890'
      const mockMetadata = {
        details: {
          id: 67890,
          name: 'Test Show',
        },
        // watchProviders is undefined
      }

      vi.mocked(tmdbService.getShowMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichShowMetadata(tmdbId)

      expect(result).toEqual(mockMetadata)
      expect(result?.watchProviders).toBeUndefined()
    })

    it('should handle show with multiple seasons', async () => {
      const tmdbId = '67890'
      const mockMetadata = {
        details: {
          id: 67890,
          name: 'Long Running Show',
          number_of_seasons: 10,
          number_of_episodes: 200,
          genres: [{ id: 18, name: 'Drama' }],
        },
        watchProviders: {
          results: {},
        },
      }

      vi.mocked(tmdbService.getShowMetadata).mockResolvedValue(mockMetadata as any)

      const result = await enrichShowMetadata(tmdbId)

      expect(result?.details.number_of_seasons).toBe(10)
      expect(result?.details.number_of_episodes).toBe(200)
    })
  })

  describe('error handling and edge cases', () => {
    it('should handle network timeout errors', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345',
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('12345')
      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await enrichContentMetadata(content)

      expect(result.tmdbMetadata).toBeUndefined()
    })

    it('should handle rate limit errors', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345',
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('12345')
      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('Rate limit exceeded'))

      const result = await enrichContentMetadata(content)

      expect(result.tmdbMetadata).toBeUndefined()
    })

    it('should handle invalid JSON responses', async () => {
      const tmdbId = '12345'

      vi.mocked(tmdbService.getMovieMetadata).mockRejectedValue(new Error('Unexpected token'))

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toBeUndefined()
    })

    it('should handle TMDB service returning null', async () => {
      const tmdbId = '12345'

      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue(null as any)

      const result = await enrichMovieMetadata(tmdbId)

      expect(result).toBeNull()
    })

    it('should handle concurrent enrichment requests', async () => {
      const contents: ContentMetadata[] = [
        { title: 'Movie 1', type: 'movie', guid: 'tmdb://1' },
        { title: 'Movie 2', type: 'movie', guid: 'tmdb://2' },
        { title: 'Show 1', type: 'show', guid: 'tmdb://3' },
      ]

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockImplementation((guid) => {
        return guid?.replace('tmdb://', '') || null
      })

      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue({ details: {} } as any)
      vi.mocked(tmdbService.getShowMetadata).mockResolvedValue({ details: {} } as any)

      const results = await Promise.all(contents.map(enrichContentMetadata))

      expect(results).toHaveLength(3)
      expect(tmdbService.getMovieMetadata).toHaveBeenCalledTimes(2)
      expect(tmdbService.getShowMetadata).toHaveBeenCalledTimes(1)
    })

    it('should handle guid with special characters', async () => {
      const content: ContentMetadata = {
        title: 'Test Movie',
        type: 'movie',
        guid: 'tmdb://12345?language=en-US',
      }

      vi.mocked(guidHandler.extractTmdbIdFromGuid).mockReturnValue('12345')
      vi.mocked(tmdbService.getMovieMetadata).mockResolvedValue({ details: {} } as any)

      const result = await enrichContentMetadata(content)

      expect(guidHandler.extractTmdbIdFromGuid).toHaveBeenCalledWith('tmdb://12345?language=en-US')
      expect(result.tmdbMetadata).toBeDefined()
    })
  })
})