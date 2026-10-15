import {
  probeConnections,
  probeServerAccess,
  testConnectionReachability,
} from '@services/plex-server/existence-check/connection-cache.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const UP = { uri: 'http://up.test:32400', local: true, relay: false }
const BROKEN = { uri: 'http://broken.test:32400', local: false, relay: false }
const GONE = { uri: 'http://gone.test:32400', local: false, relay: false }

function serveProbes() {
  server.use(
    http.get(`${UP.uri}/identity`, () => HttpResponse.json({})),
    http.get(
      `${BROKEN.uri}/identity`,
      () => new HttpResponse(null, { status: 503 }),
    ),
    http.get(`${GONE.uri}/identity`, () => HttpResponse.error()),
  )
}

describe('probeConnections', () => {
  it('reports latency for a reachable connection and a category otherwise', async () => {
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
    expect(probed[0]?.outcome).toMatchObject({ reachable: true, failure: null })
    expect(probed[0]?.outcome.latencyMs).toBeGreaterThanOrEqual(0)
    expect(probed[1]?.outcome).toEqual({
      reachable: false,
      latencyMs: null,
      failure: 'http',
      httpStatus: 503,
    })
    expect(probed[2]?.outcome).toMatchObject({
      reachable: false,
      failure: 'unreachable',
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
        return HttpResponse.json({})
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
        return HttpResponse.json({})
      }),
    )

    await probeServerAccess(UP.uri, 'token', createMockLogger())

    expect(sent).toBe('token')
  })
})
