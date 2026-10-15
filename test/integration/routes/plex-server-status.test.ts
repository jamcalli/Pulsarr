import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { plexConnection, plexResource } from '../../mocks/plex-resources.js'
import { server } from '../../setup/msw-setup.js'

const LINKED_TOKEN = 'test_plex_token_1234567890'
const NEGOTIATED = 'https://plex-a.status.test:32400'
const SAVED = 'http://plex-b.status.test:32400'

describe('GET /v1/plex/server-status', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.config.plexTokens = [LINKED_TOKEN]
    app.config.plexServerUrl = ''
    app.plexServerService.clearCaches()
    server.use(
      http.get('https://plex.tv/api/v2/resources', () =>
        HttpResponse.json([
          plexResource({
            name: 'Basement',
            connections: [plexConnection({ uri: NEGOTIATED })],
          }),
        ]),
      ),
      http.get(`${NEGOTIATED}/identity`, () => HttpResponse.json({})),
      http.get(`${NEGOTIATED}/`, () => HttpResponse.json({})),
      http.get(`${SAVED}/`, () => HttpResponse.error()),
    )
  })

  function get() {
    return app.inject({ method: 'GET', url: '/v1/plex/server-status' })
  }

  it('probes the negotiated connection in automatic mode', async () => {
    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      reachable: true,
      url: NEGOTIATED,
      automatic: true,
      failure: null,
      serverName: 'Basement',
    })
    expect(res.json().latencyMs).toEqual(expect.any(Number))
  })

  it('probes the saved address and reports why it failed', async () => {
    app.config.plexServerUrl = SAVED

    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      reachable: false,
      url: SAVED,
      automatic: false,
      latencyMs: null,
      failure: 'unreachable',
    })
  })

  it('reports a reachable server that rejects the linked token', async () => {
    server.use(
      http.get(`${NEGOTIATED}/`, () => new HttpResponse(null, { status: 401 })),
    )

    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      reachable: false,
      url: NEGOTIATED,
      failure: 'unauthorized',
    })
  })
})
