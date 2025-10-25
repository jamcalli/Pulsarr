import { fetchPlexAvatar, pingPlex } from '@root/utils/plex/api-client.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/api-client', () => {
  describe('pingPlex', () => {
    const mockLogger = createMockLogger()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    afterEach(() => {
      server.resetHandlers()
    })

    it('should return true when Plex API responds with 200', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', ({ request }) => {
          const token = request.headers.get('X-Plex-Token')
          const clientId = request.headers.get('X-Plex-Client-Identifier')

          if (token === 'valid-token' && clientId === 'pulsarr') {
            return HttpResponse.json({ status: 'ok' })
          }
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const result = await pingPlex('valid-token', mockLogger)
      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully validated Plex token',
      )
    })

    it('should return false when Plex API responds with 401', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', () => {
          return new HttpResponse(null, {
            status: 401,
            statusText: 'Unauthorized',
          })
        }),
      )

      const result = await pingPlex('invalid-token', mockLogger)
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plex ping failed with status 401: Unauthorized',
      )
    })

    it('should return false when Plex API responds with 500', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', () => {
          return new HttpResponse(null, {
            status: 500,
            statusText: 'Internal Server Error',
          })
        }),
      )

      const result = await pingPlex('token', mockLogger)
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plex ping failed with status 500: Internal Server Error',
      )
    })

    it('should return false when network error occurs', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', () => {
          return HttpResponse.error()
        }),
      )

      const result = await pingPlex('token', mockLogger)
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to validate Plex token',
      )
    })

    it('should return false when request times out', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', async () => {
          // Delay longer than PLEX_API_TIMEOUT_MS (5000ms)
          await new Promise((resolve) => setTimeout(resolve, 6000))
          return HttpResponse.json({ status: 'ok' })
        }),
      )

      const result = await pingPlex('token', mockLogger)
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalled()
    }, 10000)

    it('should include correct headers in request', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get('https://plex.tv/api/v2/ping', ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({ status: 'ok' })
        }),
      )

      await pingPlex('test-token', mockLogger)

      expect(capturedHeaders?.get('X-Plex-Token')).toBe('test-token')
      expect(capturedHeaders?.get('X-Plex-Client-Identifier')).toBe('pulsarr')
      expect(capturedHeaders?.get('Accept')).toBe('application/json')
    })
  })

  describe('fetchPlexAvatar', () => {
    const mockLogger = createMockLogger()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    afterEach(() => {
      server.resetHandlers()
    })

    it('should return avatar URL when user has thumb', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return HttpResponse.json({
            thumb: 'https://plex.tv/users/abc123/avatar?c=1234567890',
          })
        }),
      )

      const result = await fetchPlexAvatar('valid-token', mockLogger)
      expect(result).toBe('https://plex.tv/users/abc123/avatar?c=1234567890')
    })

    it('should return null when user has no thumb', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return HttpResponse.json({
            username: 'testuser',
            email: 'test@example.com',
          })
        }),
      )

      const result = await fetchPlexAvatar('valid-token', mockLogger)
      expect(result).toBe(null)
    })

    it('should return null when API responds with 401', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const result = await fetchPlexAvatar('invalid-token', mockLogger)
      expect(result).toBe(null)
    })

    it('should return null when API responds with 500', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )

      const result = await fetchPlexAvatar('token', mockLogger)
      expect(result).toBe(null)
    })

    it('should return null and log warning when network error occurs', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return HttpResponse.error()
        }),
      )

      const result = await fetchPlexAvatar('token', mockLogger)
      expect(result).toBe(null)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to fetch Plex avatar',
      )
    })

    it('should return null when request times out', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', async () => {
          await new Promise((resolve) => setTimeout(resolve, 6000))
          return HttpResponse.json({ thumb: 'should-not-reach' })
        }),
      )

      const result = await fetchPlexAvatar('token', mockLogger)
      expect(result).toBe(null)
    }, 10000)

    it('should work without logger parameter', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return HttpResponse.json({
            thumb: 'https://plex.tv/users/xyz/avatar',
          })
        }),
      )

      const result = await fetchPlexAvatar('token')
      expect(result).toBe('https://plex.tv/users/xyz/avatar')
    })

    it('should not throw when logger is undefined and error occurs', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/user', () => {
          return HttpResponse.error()
        }),
      )

      const result = await fetchPlexAvatar('token')
      expect(result).toBe(null)
    })

    it('should include correct headers in request', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get('https://plex.tv/api/v2/user', ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({ thumb: 'test' })
        }),
      )

      await fetchPlexAvatar('test-token', mockLogger)

      expect(capturedHeaders?.get('X-Plex-Token')).toBe('test-token')
      expect(capturedHeaders?.get('Accept')).toBe('application/json')
    })
  })
})
