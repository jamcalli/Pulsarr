import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
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
import { server } from '../../setup/msw-setup.js'

const APPRISE_BASE = 'http://apprise-config.test:8000'

describe('Config Apprise URL changes', () => {
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
    app.config.appriseUrl = ''
    await app.db.updateConfig({ appriseUrl: '' })
    await app.notifications.apprise.applyConfigChange()
  })

  it('saves the url and enables Apprise once the server answers', async () => {
    server.use(
      http.get(`${APPRISE_BASE}/`, () => new HttpResponse(null)),
      http.get(`${APPRISE_BASE}/details/`, () =>
        HttpResponse.json({ schemas: [] }),
      ),
    )

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { appriseUrl: APPRISE_BASE },
    })

    expect(res.statusCode).toBe(200)
    expect((await app.db.getConfig())?.appriseUrl).toBe(APPRISE_BASE)
    await vi.waitFor(() =>
      expect(app.notifications.apprise.getStatus()).toBe('enabled'),
    )

    const get = await app.inject({ method: 'GET', url: '/v1/config' })
    expect(get.statusCode).toBe(200)
    expect(get.json().config).toMatchObject({
      appriseUrl: APPRISE_BASE,
      enableApprise: true,
    })
  })

  it('rejects a request that sets enableApprise', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { enableApprise: true },
    })

    expect(res.statusCode).toBe(400)
    expect(app.config.enableApprise).toBe(false)
    expect(app.notifications.apprise.getStatus()).toBe('not_configured')
  })
})
