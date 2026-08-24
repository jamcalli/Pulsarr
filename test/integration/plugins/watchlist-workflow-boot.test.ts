import type { FastifyInstance } from 'fastify'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../helpers/database.js'
import { seedConfig } from '../../helpers/seeds/config.js'

// Each test boots the app to exercise the boot auto-start path. Booting the
// full app takes 7-10s on loaded CI runners, so the global 10s timeout has no
// headroom.
describe('watchlist workflow boot auto-start', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function seedWithReady(isReady: boolean) {
    const knex = getTestDatabase()
    await seedConfig(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: isReady })
  }

  it('starts the workflow at boot when _isReady was persisted true', async () => {
    await seedWithReady(true)
    app = await build()
    await app.ready()

    const workflow = app.watchlistWorkflow
    await vi.waitFor(
      () => expect(['starting', 'running']).toContain(workflow.getStatus()),
      { timeout: 15_000 },
    )

    app.config.authenticationMethod = 'disabled'
    const stopRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-workflow/stop',
    })
    expect(stopRes.statusCode).toBe(200)
    await vi.waitFor(() => expect(workflow.getStatus()).toBe('stopped'), {
      timeout: 15_000,
    })
  })

  it('does not start the workflow at boot when _isReady was persisted false', async () => {
    await seedWithReady(false)
    app = await build()
    await app.ready()

    // the auto-start callback was queued during boot; queue behind it
    await new Promise((resolve) => setImmediate(resolve))
    expect(app.watchlistWorkflow.getStatus()).toBe('stopped')
  })

  it('does not start the workflow at boot when no config row exists', async () => {
    app = await build()
    await app.ready()

    await new Promise((resolve) => setImmediate(resolve))
    expect(app.watchlistWorkflow.getStatus()).toBe('stopped')
  })
})
