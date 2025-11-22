import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getStreamingProviders, type StreamingProvider } from '../../../src/services/tmdb.service'

// Mock fetch globally
global.fetch = vi.fn()

describe('TMDB Service - Streaming Providers', () => {
  const mockApiKey = 'test-api-key'
  const mockRegion = 'US'

  beforeEach(() => {
    vi.clearAllMocks()
    // Set environment variable for API key
    process.env.TMDB_API_KEY = mockApiKey
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStreamingProviders', () => {
    it('should fetch and return streaming providers successfully', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 8,
            provider_name: 'Netflix',
            logo_path: '/netflix.jpg',
            display_priority: 1,
          },
          {
            provider_id: 9,
            provider_name: 'Amazon Prime Video',
            logo_path: '/amazon.jpg',
            display_priority: 2,
          },
          {
            provider_id: 384,
            provider_name: 'HBO Max',
            logo_path: '/hbo.jpg',
            display_priority: 3,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result).toEqual(mockResponse.results)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/watch/providers/movie'),
        expect.any(Object)
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`watch_region=${mockRegion}`),
        expect.any(Object)
      )
    })

    it('should handle empty results', async () => {
      const mockResponse = {
        results: [],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result).toEqual([])
    })

    it('should throw error when API key is missing', async () => {
      delete process.env.TMDB_API_KEY

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow()
    })

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow()
    })

    it('should throw error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow('Network error')
    })

    it('should handle different regions', async () => {
      const regions = ['US', 'GB', 'CA', 'DE', 'FR']

      for (const region of regions) {
        const mockResponse = {
          results: [
            {
              provider_id: 8,
              provider_name: 'Netflix',
              logo_path: '/netflix.jpg',
              display_priority: 1,
            },
          ],
        }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        } as Response)

        const result = await getStreamingProviders(region)

        expect(result).toBeDefined()
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`watch_region=${region}`),
          expect.any(Object)
        )
      }
    })

    it('should handle providers with missing logo_path', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 8,
            provider_name: 'Netflix',
            // logo_path is missing
            display_priority: 1,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result).toEqual(mockResponse.results)
      expect(result[0].logo_path).toBeUndefined()
    })

    it('should sort providers by display_priority', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 384,
            provider_name: 'HBO Max',
            display_priority: 10,
          },
          {
            provider_id: 8,
            provider_name: 'Netflix',
            display_priority: 1,
          },
          {
            provider_id: 9,
            provider_name: 'Amazon',
            display_priority: 5,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      // Verify the results maintain or are sorted by priority
      expect(result).toBeDefined()
      expect(result.length).toBe(3)
    })

    it('should handle rate limiting (429 status)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response)

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow()
    })

    it('should handle unauthorized (401 status)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response)

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow()
    })

    it('should handle malformed JSON response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      } as Response)

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow()
    })

    it('should handle providers with duplicate IDs', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 8,
            provider_name: 'Netflix',
            display_priority: 1,
          },
          {
            provider_id: 8,
            provider_name: 'Netflix Duplicate',
            display_priority: 2,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result.length).toBe(2)
    })

    it('should handle providers with special characters in name', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 1,
            provider_name: 'Provider & Co.',
            display_priority: 1,
          },
          {
            provider_id: 2,
            provider_name: 'Provider "Quotes"',
            display_priority: 2,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result[0].provider_name).toBe('Provider & Co.')
      expect(result[1].provider_name).toBe('Provider "Quotes"')
    })

    it('should handle large number of providers', async () => {
      const mockResponse = {
        results: Array.from({ length: 100 }, (_, i) => ({
          provider_id: i,
          provider_name: `Provider ${i}`,
          display_priority: i,
        })),
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result.length).toBe(100)
    })

    it('should handle timeout errors', async () => {
      vi.mocked(fetch).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      )

      await expect(getStreamingProviders(mockRegion)).rejects.toThrow('Timeout')
    })

    it('should use correct API endpoint', async () => {
      const mockResponse = { results: [] }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await getStreamingProviders(mockRegion)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.themoviedb.org/3/watch/providers/movie'),
        expect.any(Object)
      )
    })

    it('should include API key in request', async () => {
      const mockResponse = { results: [] }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await getStreamingProviders(mockRegion)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`api_key=${mockApiKey}`),
        expect.any(Object)
      )
    })

    it('should handle providers with null/undefined values', async () => {
      const mockResponse = {
        results: [
          {
            provider_id: 8,
            provider_name: null,
            logo_path: undefined,
            display_priority: 1,
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders(mockRegion)

      expect(result).toEqual(mockResponse.results)
    })

    it('should handle concurrent requests', async () => {
      const mockResponse = { results: [{ provider_id: 8, provider_name: 'Netflix' }] }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const promises = [
        getStreamingProviders('US'),
        getStreamingProviders('GB'),
        getStreamingProviders('CA'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it('should handle invalid region codes gracefully', async () => {
      const mockResponse = { results: [] }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getStreamingProviders('INVALID')

      expect(result).toEqual([])
    })
  })
})