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

const ENV_BASE = 'http://maintainerr-env.test:6246'
const NEW_BASE = 'http://maintainerr-new.test:6246'
const PULSARR_CONFIG = {
  id: 7,
  name: 'Pulsarr',
  agent: 'webhook',
  enabled: true,
  types: [16],
  options: {},
}

describe('Config Maintainerr URL changes', () => {
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
    app.config.maintainerrEnabled = false
    await app.db.updateConfig({ maintainerrUrl: '' })
  })

  it('disables the live instance when the stored url lags an env value', async () => {
    app.config.maintainerrUrl = ENV_BASE
    const disabled: unknown[] = []
    server.use(
      http.get(`${ENV_BASE}/api/notifications/configurations`, () =>
        HttpResponse.json([PULSARR_CONFIG]),
      ),
      http.post(
        `${ENV_BASE}/api/notifications/configuration/add`,
        async ({ request }) => {
          disabled.push(await request.json())
          return HttpResponse.json({ code: 1, status: 'OK' })
        },
      ),
      http.get(`${NEW_BASE}/api/notifications/configurations`, () =>
        HttpResponse.json([]),
      ),
    )

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { maintainerrUrl: NEW_BASE },
    })

    expect(res.statusCode).toBe(200)
    await vi.waitFor(() => expect(disabled).toHaveLength(1))
    expect(disabled[0]).toMatchObject({ id: 7, enabled: false })
  })
})
