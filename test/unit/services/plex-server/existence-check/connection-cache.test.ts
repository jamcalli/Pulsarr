import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  createServerConnectionCache,
  getBestServerConnection,
  invalidateServerConnection,
  probeConnections,
  probeServerAccess,
  SERVER_CONNECTION_CACHE_TTL_MS,
  type ServerConnectionCache,
  testConnectionReachability,
} from '@services/plex-server/existence-check/connection-cache.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { PLEX_IDENTITY } from '../../../../mocks/plex-resources.js'
import { server } from '../../../../setup/msw-setup.js'

const UP = { uri: 'http://up.test:32400', local: true, relay: false }
const BROKEN = { uri: 'http://broken.test:32400', local: false, relay: false }
const GONE = { uri: 'http://gone.test:32400', local: false, relay: false }

function serveProbes() {
  server.use(
    http.get(`${UP.uri}/identity`, () => HttpResponse.json(PLEX_IDENTITY)),
    http.get(
      `${BROKEN.uri}/identity`,
      () => new HttpResponse(null, { status: 503 }),
    ),
    http.get(`${GONE.uri}/identity`, () => HttpResponse.error()),
  )
}

describe('probeConnections', () => {
  it('times a working connection and reports a failure code otherwise', async () => {
    serveProbes()

    const probed = await probeConnections(
      [UP, BROKEN, GONE],
      createMockLogger(),
    )

    expect(probed.map(({ connection }) => connection)).toEqual([
      UP,
      BROKEN,
      GONE,
    ])
    expect(probed[0]?.outcome).toEqual({
      ok: true,
      elapsedMs: expect.any(Number),
    })
    expect(probed[1]?.outcome).toEqual({
      ok: false,
      reason: 'unavailable',
      status: 503,
    })
    expect(probed[2]?.outcome).toEqual({
      ok: false,
      reason: 'unreachable',
      status: null,
    })
  })
})

describe('testConnectionReachability', () => {
  it('keeps only reachable connections in their original order', async () => {
    serveProbes()

    expect(
      await testConnectionReachability([GONE, UP, BROKEN], createMockLogger()),
    ).toEqual([UP])
  })
})

describe('probe token handling', () => {
  it('probes reachability without sending the token', async () => {
    let sent: string | null = 'unset'
    server.use(
      http.get(`${UP.uri}/identity`, ({ request }) => {
        sent = request.headers.get('X-Plex-Token')
        return HttpResponse.json(PLEX_IDENTITY)
      }),
    )

    await probeConnections([UP], createMockLogger())

    expect(sent).toBeNull()
  })

  it('sends the token only when checking server access', async () => {
    let sent: string | null = null
    server.use(
      http.get(`${UP.uri}/`, ({ request }) => {
        sent = request.headers.get('X-Plex-Token')
        return HttpResponse.json(PLEX_IDENTITY)
      }),
    )

    await probeServerAccess(UP.uri, 'token', createMockLogger())

    expect(sent).toBe('token')
  })
})

describe('probe response check', () => {
  it.each([
    ['JSON that is not a Plex identity', () => HttpResponse.json({ ok: true })],
    ['an HTML page', () => HttpResponse.text('<html></html>')],
  ])('fails a 200 with %s as invalid', async (_name, respond) => {
    server.use(http.get(`${UP.uri}/identity`, respond))

    const [probed] = await probeConnections([UP], createMockLogger())

    expect(probed?.outcome).toEqual({
      ok: false,
      reason: 'invalid',
      status: 200,
    })
  })
})

describe('probe server match', () => {
  it('accepts the server Plex listed and rejects a different one', async () => {
    server.use(
      http.get(`${UP.uri}/identity`, () => HttpResponse.json(PLEX_IDENTITY)),
    )

    const [listed, other] = await probeConnections(
      [
        { ...UP, machineId: PLEX_IDENTITY.MediaContainer.machineIdentifier },
        { ...UP, machineId: 'another-server' },
      ],
      createMockLogger(),
    )

    expect(listed?.outcome.ok).toBe(true)
    expect(other?.outcome).toEqual({
      ok: false,
      reason: 'invalid',
      status: 200,
    })
  })
})

describe('getBestServerConnection', () => {
  const DEAD_SERVER_BACKOFF = 5 * 60 * 1000
  const logger = createMockLogger()

  let now: number
  let probes: number
  let deadServers: Map<string, number>
  let cache: ServerConnectionCache

  function best(connections = [GONE, UP]) {
    return getBestServerConnection(
      'machine-1',
      { serverName: 'Basement', connections, accessToken: 'server-token' },
      cache,
      deadServers,
      { logger, deadServerBackoff: DEAD_SERVER_BACKOFF },
    )
  }

  beforeEach(() => {
    now = 1
    probes = 0
    deadServers = new Map()
    cache = createServerConnectionCache(
      new CacheRegistry({ now: () => now }),
      deadServers,
      logger,
    )
    serveProbes()
    server.use(
      http.get(`${UP.uri}/identity`, () => {
        probes += 1
        return HttpResponse.json(PLEX_IDENTITY)
      }),
    )
  })

  it('keeps the picked connection for its TTL', async () => {
    expect(await best()).toEqual({ uri: UP.uri, accessToken: 'server-token' })
    now += SERVER_CONNECTION_CACHE_TTL_MS
    await best()
    expect(probes).toBe(1)

    now += 1
    await best()
    expect(probes).toBe(2)
  })

  it('shares one probe between concurrent lookups', async () => {
    await Promise.all([best(), best(), best()])

    expect(probes).toBe(1)
  })

  it('probes again after the connection is invalidated', async () => {
    await best()

    invalidateServerConnection('machine-1', cache, logger)
    await best()

    expect(probes).toBe(2)
  })

  it('stores nothing and backs off when every connection fails', async () => {
    expect(await best([GONE, BROKEN])).toBeNull()

    expect(cache.size).toBe(0)
    expect(deadServers.has('machine-1')).toBe(true)
    expect(await best()).toBeNull()
    expect(probes).toBe(0)
  })
})
