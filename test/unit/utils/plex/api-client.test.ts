import { pingPlex } from '@services/plex-watchlist/api/client.js'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/api-client', () => {
  describe('pingPlex', () => {
    const mockLogger = createMockLogger()

    afterEach(() => {
      server.resetHandlers()
    })

    it('accepts the token when Plex API responds with 200', async () => {
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
      expect(result).toBe('accepted')
    })

    it('reports a rejection when Plex API responds with 401', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', () => {
          return new HttpResponse(null, {
            status: 401,
            statusText: 'Unauthorized',
          })
        }),
      )

      const result = await pingPlex('invalid-token', mockLogger)
      expect(result).toBe('rejected')
    })

    it.each([
      [429, 'Too Many Requests'],
      [500, 'Internal Server Error'],
    ])(
      'reports plex.tv unreachable when it responds with %i',
      async (status, statusText) => {
        server.use(
          http.get('https://plex.tv/api/v2/ping', () => {
            return new HttpResponse(null, { status, statusText })
          }),
        )

        const result = await pingPlex('token', mockLogger)
        expect(result).toBe('unreachable')
      },
    )

    it('reports plex.tv unreachable on a network error', async () => {
      server.use(
        http.get('https://plex.tv/api/v2/ping', () => {
          return HttpResponse.error()
        }),
      )

      const result = await pingPlex('token', mockLogger)
      expect(result).toBe('unreachable')
    })

    it('reports plex.tv unreachable when the request times out', async () => {
      const originalTimeout = AbortSignal.timeout
      try {
        AbortSignal.timeout = () => {
          const controller = new AbortController()
          controller.abort(new DOMException('TimeoutError', 'TimeoutError'))
          return controller.signal
        }

        server.use(
          http.get('https://plex.tv/api/v2/ping', async () => {
            return HttpResponse.json({ status: 'ok' })
          }),
        )

        const result = await pingPlex('token', mockLogger)
        expect(result).toBe('unreachable')
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
