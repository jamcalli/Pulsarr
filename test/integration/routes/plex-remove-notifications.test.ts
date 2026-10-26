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

describe('DELETE /v1/plex/remove-notifications', () => {
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
    app.radarrManager.getAllInstances = vi.fn().mockResolvedValue([])
    app.sonarrManager.getAllInstances = vi.fn().mockResolvedValue([])
  })

  it('rejects the request when no Radarr or Sonarr instance exists', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/plex/remove-notifications',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      message: 'No Radarr or Sonarr instances configured',
    })
  })
})
