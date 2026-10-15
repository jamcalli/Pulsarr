import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const LINKED_TOKEN = 'test_plex_token_1234567890'

describe('POST /v1/plex/configure-notifications', () => {
  let app: FastifyInstance
  let configure: ReturnType<typeof vi.fn>

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
    configure = vi.fn().mockResolvedValue(undefined)
    app.radarrManager.getAllInstances = vi
      .fn()
      .mockResolvedValue([{ id: 1, name: 'Radarr' }])
    app.sonarrManager.getAllInstances = vi.fn().mockResolvedValue([])
    app.radarrManager.getRadarrService = vi
      .fn()
      .mockReturnValue({ configurePlexNotification: configure })
  })

  function serverUrl(url: string) {
    vi.spyOn(app.plexServerService, 'getPlexServerUrl').mockResolvedValue(url)
  }

  function post(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/v1/plex/configure-notifications',
      payload,
    })
  }

  it('uses the saved http server with its port and the linked token', async () => {
    serverUrl('http://192.168.1.100:32401')

    const res = await post({})

    expect(res.statusCode).toBe(200)
    expect(configure).toHaveBeenCalledWith(
      LINKED_TOKEN,
      '192.168.1.100',
      32401,
      false,
    )
  })

  it('uses port 443 and SSL for an https server without a port', async () => {
    serverUrl('https://plex.example.com')

    const res = await post({})

    expect(res.statusCode).toBe(200)
    expect(configure).toHaveBeenCalledWith(
      LINKED_TOKEN,
      'plex.example.com',
      443,
      true,
    )
  })

  it('lets an explicit body win over the saved server', async () => {
    serverUrl('https://plex.example.com')

    const res = await post({
      plexToken: 'other-token',
      plexHost: '10.0.0.5',
      plexPort: 32400,
      useSsl: false,
    })

    expect(res.statusCode).toBe(200)
    expect(configure).toHaveBeenCalledWith(
      'other-token',
      '10.0.0.5',
      32400,
      false,
    )
  })

  it('rejects a request with no linked token', async () => {
    serverUrl('http://192.168.1.100:32400')
    app.config.plexTokens = []

    const res = await post({})

    expect(res.statusCode).toBe(400)
    expect(configure).not.toHaveBeenCalled()
  })
})
