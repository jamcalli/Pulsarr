import { pingPlex } from '@services/plex-watchlist/index.js'
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
      // Mock AbortSignal.timeout to return an immediately aborted signal
      const originalTimeout = AbortSignal.timeout
      try {
        AbortSignal.timeout = () => {
          const controller = new AbortController()
          controller.abort(new DOMException('TimeoutError', 'TimeoutError'))
          return controller.signal
        }

        server.use(
          http.get('https://plex.tv/api/v2/ping', async () => {
            // This handler won't be reached due to immediate abort
            return HttpResponse.json({ status: 'ok' })
          }),
        )

        const result = await pingPlex('token', mockLogger)
        expect(result).toBe(false)
        expect(mockLogger.error).toHaveBeenCalled()
      } finally {
        AbortSignal.timeout = originalTimeout
      }
    })

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
})
