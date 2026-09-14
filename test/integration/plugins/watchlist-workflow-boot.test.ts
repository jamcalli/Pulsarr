import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
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
import { seedInstances } from '../../helpers/seeds/instances.js'
import { seedUsers } from '../../helpers/seeds/users.js'
import { server } from '../../setup/msw-setup.js'

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

describe('watchlist workflow full reconcile', { timeout: 30_000 }, () => {
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

  it('advances the last successful sync time', async () => {
    const knex = getTestDatabase()
    await seedConfig(knex)
    await seedUsers(knex)
    await seedInstances(knex)

    server.use(
      http.get('http://test-sonarr:8989/api/v3/system/status', () =>
        HttpResponse.json({ version: '4.0.0' }),
      ),
      http.get('http://test-radarr:7878/api/v3/system/status', () =>
        HttpResponse.json({ version: '5.0.0' }),
      ),
      http.get('http://test-sonarr:8989/api/v3/importlistexclusion/paged', () =>
        HttpResponse.json({
          page: 1,
          pageSize: 1000,
          totalRecords: 0,
          records: [],
        }),
      ),
      http.get('http://test-radarr:7878/api/v3/exclusions/paged', () =>
        HttpResponse.json({
          page: 1,
          pageSize: 1000,
          totalRecords: 0,
          records: [],
        }),
      ),
    )

    app = await build()
    await app.ready()

    const checkFriendChanges = vi
      .spyOn(app.plexWatchlist, 'checkFriendChanges')
      .mockResolvedValue({ added: [], removed: [], userMap: new Map() })

    const before = app.watchlistWorkflow.getLastSuccessfulSyncTime()

    await app.watchlistWorkflow.reconcile({ mode: 'full' })

    expect(app.watchlistWorkflow.getLastSuccessfulSyncTime()).toBeGreaterThan(
      before,
    )
    expect(checkFriendChanges).toHaveBeenCalledTimes(1)
  })
})
