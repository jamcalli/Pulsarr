import {
  probeConnections,
  probeServerAccess,
  testConnectionReachability,
} from '@services/plex-server/existence-check/connection-cache.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
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
      code: 'invalid',
      status: 503,
    })
    expect(probed[2]?.outcome).toEqual({
      ok: false,
      code: 'unreachable',
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

    expect(probed?.outcome).toEqual({ ok: false, code: 'invalid', status: 200 })
  })
})
