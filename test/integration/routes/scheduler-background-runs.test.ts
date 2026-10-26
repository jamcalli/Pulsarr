import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { createDeferred } from '../../helpers/deferred.js'
import { seedAll } from '../../helpers/seeds/index.js'

type Movies = Awaited<
  ReturnType<FastifyInstance['radarrManager']['fetchAllMovies']>
>

const TEST_JOB = 'background-run-test-job'

describe('scheduler background runs', () => {
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
  })

  afterEach(async () => {
    await app.scheduler.unscheduleJob(TEST_JOB)
    vi.restoreAllMocks()
  })

  describe('delete sync dry run', () => {
    const dryRunStatus = async () =>
      (
        await app.inject({
          method: 'GET',
          url: '/v1/scheduler/schedules/delete-sync/dry-run/status',
        })
      ).json()

    const startDryRun = () =>
      app.inject({
        method: 'POST',
        url: '/v1/scheduler/schedules/delete-sync/dry-run/start',
      })

    async function seedDeleteSync() {
      await app.db.createSchedule({
        name: 'delete-sync',
        type: 'interval',
        config: { hours: 24 },
        enabled: true,
        last_run: null,
        next_run: null,
      })
      app.config.deleteMovie = true
      vi.spyOn(app.sonarrManager, 'fetchAllSeries').mockResolvedValue([])
      vi.spyOn(app.plexWatchlist, 'getSelfWatchlist').mockResolvedValue({
        total: 0,
        users: [],
      })
      vi.spyOn(app.plexWatchlist, 'getOthersWatchlists').mockResolvedValue({
        total: 0,
        users: [],
      })
      const movies = createDeferred<Movies>()
      vi.spyOn(app.radarrManager, 'fetchAllMovies').mockReturnValue(
        movies.promise,
      )
      return movies
    }

    afterEach(() => {
      app.config.deleteMovie = false
    })

    it('returns 202, 409 while it runs, then reads done with the result', async () => {
      const movies = await seedDeleteSync()

      const res = await startDryRun()

      expect(res.statusCode).toBe(202)
      expect(res.json()).toEqual({ message: 'Delete sync dry run started' })
      expect(await dryRunStatus()).toMatchObject({
        state: 'running',
        result: null,
      })
      expect((await startDryRun()).statusCode).toBe(409)

      movies.resolve([])
      await vi.waitFor(async () =>
        expect(await dryRunStatus()).toMatchObject({
          state: 'done',
          error: null,
          result: {
            success: true,
            message: expect.stringMatching(/^Delete sync dry run/),
            results: { total: expect.any(Object) },
          },
        }),
      )
    })

    it('reads failed with the message when the dry run throws', async () => {
      const movies = await seedDeleteSync()

      expect((await startDryRun()).statusCode).toBe(202)
      movies.reject(new Error('Radarr is unreachable'))

      await vi.waitFor(async () =>
        expect(await dryRunStatus()).toMatchObject({
          state: 'failed',
          error: 'Radarr is unreachable',
          result: null,
        }),
      )
    })

    it('returns 404 when the delete sync schedule is missing', async () => {
      expect((await startDryRun()).statusCode).toBe(404)
    })

    it('keeps the blocking dry run route answering with its old shape', async () => {
      const movies = await seedDeleteSync()
      movies.resolve([])

      const res = await app.inject({
        method: 'POST',
        url: '/v1/scheduler/schedules/delete-sync/dry-run',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        success: true,
        message: expect.stringMatching(/^Delete sync dry run/),
        results: expect.objectContaining({ total: expect.any(Object) }),
      })
    })
  })

  describe('run now', () => {
    const schedule = async () =>
      (
        await app.inject({
          method: 'GET',
          url: `/v1/scheduler/schedules/${TEST_JOB}`,
        })
      ).json()

    const startJob = (name = TEST_JOB) =>
      app.inject({
        method: 'POST',
        url: `/v1/scheduler/schedules/${name}/start`,
      })

    async function registerJob() {
      const run = createDeferred<void>()
      await app.scheduler.scheduleJob(TEST_JOB, () => run.promise)
      return run
    }

    it('returns 202, reads running and 409, then the completed run', async () => {
      const run = await registerJob()

      const res = await startJob()

      expect(res.statusCode).toBe(202)
      expect(await schedule()).toMatchObject({ running: true })
      expect((await startJob()).statusCode).toBe(409)

      run.resolve()
      await vi.waitFor(async () =>
        expect(await schedule()).toMatchObject({
          running: false,
          last_run: { status: 'completed' },
        }),
      )
    })

    it('reads the failed run with its error', async () => {
      const run = await registerJob()

      expect((await startJob()).statusCode).toBe(202)
      run.reject(new Error('Job exploded'))

      await vi.waitFor(async () =>
        expect(await schedule()).toMatchObject({
          running: false,
          last_run: { status: 'failed', error: 'Job exploded' },
        }),
      )
    })

    it('returns 404 for an unknown job', async () => {
      expect((await startJob('no-such-job')).statusCode).toBe(404)
    })

    it('keeps the blocking run route answering with its old shape', async () => {
      const run = await registerJob()
      run.resolve()

      const res = await app.inject({
        method: 'POST',
        url: `/v1/scheduler/schedules/${TEST_JOB}/run`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        success: true,
        message: `Job "${TEST_JOB}" executed successfully`,
      })
    })
  })
})
