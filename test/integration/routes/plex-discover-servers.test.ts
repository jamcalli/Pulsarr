import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { plexConnection, plexResource } from '../../mocks/plex-resources.js'
import { server } from '../../setup/msw-setup.js'

const UP = 'https://plex-up.discover.test:32400'
const DOWN = 'https://plex-down.discover.test:32400'

describe('POST /v1/plex/discover-servers', () => {
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
    server.use(
      http.get(`${UP}/identity`, () => HttpResponse.json({})),
      http.get(`${DOWN}/identity`, () => HttpResponse.error()),
    )
  })

  function serveResources(response: () => Response) {
    server.use(http.get('https://plex.tv/api/v2/resources', response))
  }

  function post() {
    return app.inject({
      method: 'POST',
      url: '/v1/plex/discover-servers',
      payload: { plexToken: 'pasted-token' },
    })
  }

  it('returns every connection best first with a code on each failure', async () => {
    serveResources(() =>
      HttpResponse.json([
        plexResource({
          name: 'Basement',
          httpsRequired: true,
          connections: [
            plexConnection({ uri: DOWN, local: true }),
            plexConnection({ uri: UP, local: false }),
          ],
        }),
        plexResource({ name: 'Shared', owned: false }),
      ]),
    )

    const res = await post()

    expect(res.statusCode).toBe(200)
    expect(res.json().servers).toEqual([
      {
        name: 'Basement (plex-up.discover.test)',
        host: 'plex-up.discover.test',
        port: 32400,
        useSsl: true,
        local: false,
        code: null,
      },
      {
        name: 'Basement (plex-down.discover.test)',
        host: 'plex-down.discover.test',
        port: 32400,
        useSsl: true,
        local: true,
        code: 'unreachable',
      },
    ])
  })

  it('passes a plex.tv token rejection through', async () => {
    serveResources(() => new HttpResponse(null, { status: 401 }))

    const res = await post()

    expect(res.statusCode).toBe(401)
  })
})
