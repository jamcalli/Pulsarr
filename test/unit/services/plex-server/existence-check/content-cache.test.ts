import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  type ContentAvailabilityCache,
  type ContentCheckRequest,
  checkContentOnServer,
  createContentAvailabilityCache,
  type DropServerConnection,
} from '@services/plex-server/existence-check/content-cache.js'
import { delay, HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SERVER_URI = 'http://plex.test:32400'

type Answer = 'found' | 'missing' | 'empty' | '500' | '404' | 'down' | 'slow'

describe('checkContentOnServer', () => {
  const logger = createMockLogger()

  let answer: Answer
  let requests: number
  let gate: Promise<void> | undefined
  let dropConnection: Mock<DropServerConnection>
  let cache: ContentAvailabilityCache

  function request(overrides: Partial<ContentCheckRequest> = {}) {
    return {
      serverClientId: 'machine-1',
      serverName: 'Basement',
      serverUri: SERVER_URI,
      accessToken: 'server-token',
      contentType: 'movie' as const,
      plexGuid: 'plex://movie/abc123',
      ...overrides,
    }
  }

  beforeEach(() => {
    answer = 'found'
    requests = 0
    gate = undefined
    dropConnection = vi.fn<DropServerConnection>()
    cache = createContentAvailabilityCache(
      new CacheRegistry(),
      dropConnection,
      logger,
    )
    server.use(
      http.get(`${SERVER_URI}/library/all`, async () => {
        requests += 1
        await gate
        switch (answer) {
          case 'found':
            return HttpResponse.json({
              MediaContainer: { Metadata: [{ ratingKey: '1' }] },
            })
          case 'missing':
            return HttpResponse.json({ MediaContainer: { size: 0 } })
          case 'empty':
            return HttpResponse.json({})
          case '500':
            return new HttpResponse(null, { status: 500 })
          case '404':
            return new HttpResponse(null, { status: 404 })
          case 'down':
            return HttpResponse.error()
          case 'slow':
            await delay('infinite')
            return HttpResponse.json({ MediaContainer: {} })
        }
      }),
    )
  })

  it.each(['found', 'missing'] as const)(
    'keeps a %s result for the reconciliation',
    async (state) => {
      answer = state

      expect(await checkContentOnServer(cache, request())).toBe(state)
      expect(await checkContentOnServer(cache, request())).toBe(state)

      expect(requests).toBe(1)
    },
  )

  it('keeps a body without a MediaContainer as not found and keeps the connection', async () => {
    answer = 'empty'

    expect(await checkContentOnServer(cache, request())).toBe('missing')
    expect(await checkContentOnServer(cache, request())).toBe('missing')

    expect(requests).toBe(1)
    expect(dropConnection).not.toHaveBeenCalled()
  })

  it('checks again once the cache is cleared for the next reconciliation', async () => {
    await checkContentOnServer(cache, request())

    cache.clear()
    await checkContentOnServer(cache, request())

    expect(requests).toBe(2)
  })

  it('shares one request between concurrent checks', async () => {
    const release = Promise.withResolvers<void>()
    gate = release.promise

    const checks = Promise.all([
      checkContentOnServer(cache, request()),
      checkContentOnServer(cache, request()),
    ])
    release.resolve()

    expect(await checks).toEqual(['found', 'found'])
    expect(requests).toBe(1)
  })

  it.each(['500', 'down'] as const)(
    'drops the server connection and caches nothing on %s',
    async (state) => {
      answer = state

      expect(await checkContentOnServer(cache, request())).toBe('failed')
      expect(dropConnection).toHaveBeenCalledWith(request())

      answer = 'found'
      expect(await checkContentOnServer(cache, request())).toBe('found')
      expect(requests).toBe(2)
    },
  )

  it('keeps the connection and caches nothing on a client error', async () => {
    answer = '404'

    expect(await checkContentOnServer(cache, request())).toBe('failed')
    expect(dropConnection).not.toHaveBeenCalled()
    expect(cache.size).toBe(0)
  })

  it('fails and caches nothing when the check is aborted', async () => {
    answer = 'slow'
    const controller = new AbortController()

    const check = checkContentOnServer(
      cache,
      request({ signal: controller.signal }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    expect(await check).toBe('failed')
    expect(cache.size).toBe(0)
    expect(dropConnection).not.toHaveBeenCalled()
  })

  it('checks again for a caller that joined a request another caller aborted', async () => {
    answer = 'slow'
    const controller = new AbortController()
    const aborted = checkContentOnServer(
      cache,
      request({ signal: controller.signal }),
    )
    const joined = checkContentOnServer(cache, request())
    await new Promise((resolve) => setTimeout(resolve, 10))

    answer = 'found'
    controller.abort()

    expect(await aborted).toBe('failed')
    expect(await joined).toBe('found')
    expect(requests).toBe(2)
  })

  it('answers a check overtaken by a clear without storing it', async () => {
    const release = Promise.withResolvers<void>()
    gate = release.promise

    const check = checkContentOnServer(cache, request())
    cache.clear()
    release.resolve()

    expect(await check).toBe('found')
    expect(cache.size).toBe(0)
  })
})
