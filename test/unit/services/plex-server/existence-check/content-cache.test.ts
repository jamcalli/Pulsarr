import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  createServerConnectionCache,
  type ServerConnectionCache,
} from '@services/plex-server/existence-check/connection-cache.js'
import {
  type ContentAvailabilityCache,
  type ContentCheckRequest,
  checkContentOnServer,
  createContentAvailabilityCache,
} from '@services/plex-server/existence-check/content-cache.js'
import { delay, HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SERVER_URI = 'http://plex.test:32400'
const CONNECTION = {
  uri: SERVER_URI,
  accessToken: 'server-token',
  serverName: 'Basement',
}

type Answer = 'found' | 'missing' | '500' | '404' | 'down' | 'slow'

describe('checkContentOnServer', () => {
  const logger = createMockLogger()

  let answer: Answer
  let requests: number
  let gate: Promise<void> | undefined
  let connections: ServerConnectionCache
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
    const registry = new CacheRegistry()
    connections = createServerConnectionCache(registry, new Map(), logger)
    connections.set('machine-1', CONNECTION)
    cache = createContentAvailabilityCache(registry, connections, logger)
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

  it.each([
    ['found', true],
    ['missing', false],
  ] as const)(
    'keeps a %s result for the reconciliation',
    async (state, exists) => {
      answer = state

      expect(await checkContentOnServer(cache, request())).toBe(exists)
      expect(await checkContentOnServer(cache, request())).toBe(exists)

      expect(requests).toBe(1)
    },
  )

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

    expect(await checks).toEqual([true, true])
    expect(requests).toBe(1)
  })

  it.each(['500', 'down'] as const)(
    'drops the server connection and caches nothing on %s',
    async (state) => {
      answer = state

      expect(await checkContentOnServer(cache, request())).toBe(false)
      expect(connections.has('machine-1')).toBe(false)

      answer = 'found'
      expect(await checkContentOnServer(cache, request())).toBe(true)
      expect(requests).toBe(2)
    },
  )

  it('keeps the connection and caches nothing on a client error', async () => {
    answer = '404'

    expect(await checkContentOnServer(cache, request())).toBe(false)
    expect(connections.has('machine-1')).toBe(true)
    expect(cache.size).toBe(0)
  })

  it('returns false and caches nothing when the check is aborted', async () => {
    answer = 'slow'
    const controller = new AbortController()

    const check = checkContentOnServer(
      cache,
      request({ signal: controller.signal }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    expect(await check).toBe(false)
    expect(cache.size).toBe(0)
    expect(connections.has('machine-1')).toBe(true)
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

    expect(await aborted).toBe(false)
    expect(await joined).toBe(true)
    expect(requests).toBe(2)
  })

  it('answers a check overtaken by a clear without storing it', async () => {
    const release = Promise.withResolvers<void>()
    gate = release.promise

    const check = checkContentOnServer(cache, request())
    cache.clear()
    release.resolve()

    expect(await check).toBe(true)
    expect(cache.size).toBe(0)
  })
})
