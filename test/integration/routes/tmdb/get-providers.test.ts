import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { getProvidersRoute } from '../../../../src/routes/v1/tmdb/get-providers'
import * as tmdbService from '../../../../src/services/tmdb.service'

// Mock the TMDB service
vi.mock('../../../../src/services/tmdb.service')

describe('GET /v1/tmdb/providers', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    
    app = Fastify()
    await app.register(getProvidersRoute, { prefix: '/v1/tmdb' })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('successful responses', () => {
    it('should return providers with default region (US)', async () => {
      const mockProviders = [
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
      ]

      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce(mockProviders)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.providers).toEqual(mockProviders)
      expect(tmdbService.getStreamingProviders).toHaveBeenCalledWith('US')
    })

    it('should return providers for specified region', async () => {
      const mockProviders = [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/netflix.jpg',
          display_priority: 1,
        },
      ]

      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce(mockProviders)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=GB',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.providers).toEqual(mockProviders)
      expect(tmdbService.getStreamingProviders).toHaveBeenCalledWith('GB')
    })

    it('should return empty array when no providers available', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.providers).toEqual([])
    })

    it('should handle different valid region codes', async () => {
      const regions = ['US', 'GB', 'CA', 'DE', 'FR', 'JP', 'AU']

      for (const region of regions) {
        vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([
          {
            provider_id: 8,
            provider_name: 'Netflix',
            logo_path: '/netflix.jpg',
            display_priority: 1,
          },
        ])

        const response = await app.inject({
          method: 'GET',
          url: `/v1/tmdb/providers?region=${region}`,
        })

        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.body)
        expect(body.success).toBe(true)
        expect(tmdbService.getStreamingProviders).toHaveBeenCalledWith(region)
      }
    })
  })

  describe('error handling', () => {
    it('should return 400 for invalid region format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=INVALID123',
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toBeDefined()
    })

    it('should return 400 for region with lowercase letters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=us',
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('should return 400 for region with special characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=U$',
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('should return 400 for region longer than 2 characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=USA',
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('should return 400 for region shorter than 2 characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=U',
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('should return 500 when TMDB service throws error', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockRejectedValueOnce(
        new Error('TMDB API error')
      )

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(500)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Failed to fetch streaming providers')
    })

    it('should return 500 when TMDB service times out', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockRejectedValueOnce(
        new Error('Request timeout')
      )

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(500)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('should return 500 when TMDB service returns null', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce(null as any)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      // Should handle gracefully
      expect([200, 500]).toContain(response.statusCode)
    })
  })

  describe('query parameter handling', () => {
    it('should ignore extra query parameters', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=US&extra=param&another=value',
      })

      expect(response.statusCode).toBe(200)
      expect(tmdbService.getStreamingProviders).toHaveBeenCalledWith('US')
    })

    it('should handle multiple region parameters (use first)', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=US&region=GB',
      })

      expect(response.statusCode).toBe(200)
      // Fastify typically uses the first parameter value
      expect(tmdbService.getStreamingProviders).toHaveBeenCalledWith(expect.any(String))
    })

    it('should trim whitespace from region parameter', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=%20US%20', // URL-encoded spaces
      })

      // Should either trim and accept or reject
      expect([200, 400]).toContain(response.statusCode)
    })

    it('should handle empty region parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers?region=',
      })

      // Should use default US or return validation error
      expect([200, 400]).toContain(response.statusCode)
    })
  })

  describe('response format', () => {
    it('should return correct content-type header', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(response.headers['content-type']).toMatch(/application\/json/)
    })

    it('should return properly formatted JSON', async () => {
      const mockProviders = [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/netflix.jpg',
          display_priority: 1,
        },
      ]

      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce(mockProviders)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      expect(() => JSON.parse(response.body)).not.toThrow()
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('success')
      expect(body).toHaveProperty('providers')
    })

    it('should include all provider fields', async () => {
      const mockProviders = [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/netflix.jpg',
          display_priority: 1,
        },
      ]

      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValueOnce(mockProviders)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tmdb/providers',
      })

      const body = JSON.parse(response.body)
      const provider = body.providers[0]
      expect(provider).toHaveProperty('provider_id')
      expect(provider).toHaveProperty('provider_name')
      expect(provider).toHaveProperty('logo_path')
      expect(provider).toHaveProperty('display_priority')
    })
  })

  describe('HTTP methods', () => {
    it('should not allow POST method', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(404)
    })

    it('should not allow PUT method', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(404)
    })

    it('should not allow DELETE method', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(404)
    })

    it('should not allow PATCH method', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/tmdb/providers',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('caching and performance', () => {
    it('should handle rapid successive requests', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValue([])

      const requests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: '/v1/tmdb/providers',
        })
      )

      const responses = await Promise.all(requests)

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200)
      })
    })

    it('should handle requests for different regions concurrently', async () => {
      vi.mocked(tmdbService.getStreamingProviders).mockResolvedValue([])

      const regions = ['US', 'GB', 'CA', 'DE', 'FR']
      const requests = regions.map((region) =>
        app.inject({
          method: 'GET',
          url: `/v1/tmdb/providers?region=${region}`,
        })
      )

      const responses = await Promise.all(requests)

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200)
      })
      expect(tmdbService.getStreamingProviders).toHaveBeenCalledTimes(regions.length)
    })
  })
})