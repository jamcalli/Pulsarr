import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import {
  PLEX_IDENTITY,
  plexConnection,
  plexResource,
} from '../../mocks/plex-resources.js'
import { server } from '../../setup/msw-setup.js'

const LINKED_TOKEN = 'test_plex_token_1234567890'
const NEGOTIATED = 'https://plex-a.status.test:32400'
const SAVED = 'http://plex-b.status.test:32400'

describe('GET /v1/plex/test-connection', () => {
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
      http.get(`${NEGOTIATED}/identity`, () =>
        HttpResponse.json(PLEX_IDENTITY),
      ),
      http.get(`${NEGOTIATED}/`, () => HttpResponse.json(PLEX_IDENTITY)),
      http.get(`${SAVED}/`, () => HttpResponse.error()),
    )
  })

  function get() {
    return app.inject({ method: 'GET', url: '/v1/plex/test-connection' })
  }

  it('tests the negotiated connection in automatic mode', async () => {
    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      message: 'Connected to the Plex server.',
      code: null,
      url: NEGOTIATED,
      automatic: true,
    })
  })

  it('tests the saved address and reports why it failed', async () => {
    app.config.plexServerUrl = SAVED

    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: false,
      message: "Couldn't reach the Plex server at this address.",
      code: 'unreachable',
      url: SAVED,
      automatic: false,
    })
  })

  it('reports a reachable server that rejects the linked token', async () => {
    server.use(
      http.get(`${NEGOTIATED}/`, () => new HttpResponse(null, { status: 401 })),
    )

    const res = await get()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      success: false,
      code: 'auth',
      message: "The Plex server didn't accept the linked account's token.",
      url: NEGOTIATED,
    })
  })
})
