import { RECONCILIATION_JOB_NAME } from '@services/watchlist-workflow/lifecycle/scheduler.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { WatchlistWorkflowService } from '@services/watchlist-workflow.service.js'
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
import {
  seedAll,
  useArrHandlers,
  workflowState,
} from '../../helpers/watchlist-workflow.js'

describe('watchlist workflow start and stop races', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined
  let service: WatchlistWorkflowService | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await service?.stop()
    service = undefined
    await app?.close()
    app = undefined
  })

  async function bootInEtagMode(): Promise<FastifyInstance> {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()

    const booted = await build()
    await booted.ready()

    vi.spyOn(booted.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('rss unavailable'),
    )
    vi.spyOn(booted.plexWatchlist, 'checkFriendChanges').mockResolvedValue({
      added: [],
      removed: [],
      userMap: new Map(),
    })
    return booted
  }

  function workflowDeps(workflow: WatchlistWorkflowService): WorkflowDeps {
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    return workflow['deps']
  }

  function holdPlexPing(booted: FastifyInstance) {
    const gate = Promise.withResolvers<void>()
    const spy = vi
      .spyOn(booted.plexWatchlist, 'pingPlex')
      .mockImplementationOnce(async () => {
        await gate.promise
        return 'accepted'
      })
    return { release: gate.resolve, spy }
  }

  function holdReconciliationUnschedule(booted: FastifyInstance) {
    const gate = Promise.withResolvers<void>()
    const unscheduleJob = booted.scheduler.unscheduleJob.bind(booted.scheduler)
    const spy = vi
      .spyOn(booted.scheduler, 'unscheduleJob')
      .mockImplementationOnce(async (name: string) => {
        await gate.promise
        return unscheduleJob(name)
      })
    return { release: gate.resolve, spy }
  }

  function holdPrimaryUserLookup(
    booted: FastifyInstance,
    shouldHold: (call: number) => boolean = (call) => call === 1,
  ) {
    const gate = Promise.withResolvers<void>()
    const getPrimaryUser = booted.db.getPrimaryUser.bind(booted.db)
    let calls = 0
    let held = false
    const spy = vi
      .spyOn(booted.db, 'getPrimaryUser')
      .mockImplementation(async () => {
        calls += 1
        if (!held && shouldHold(calls)) {
          held = true
          await gate.promise
        }
        return getPrimaryUser()
      })
    return { release: gate.resolve, spy, isHeld: () => held }
  }

  it('stop during startup leaves the workflow stopped with no timers', async () => {
    app = await bootInEtagMode()
    const held = holdPrimaryUserLookup(app)
    const workflow = new WatchlistWorkflowService(app.log, app, 50)

    const starting = workflow.startWorkflow()
    await vi.waitFor(() => expect(held.spy).toHaveBeenCalled())
    expect(workflow.getStatus()).toBe('starting')

    await expect(workflow.stop()).resolves.toBe(true)
    held.release()

    await expect(starting).resolves.toBe(false)
    expect(workflow.getStatus()).toBe('stopped')
    expect(workflowState(workflow).rssCheckInterval).toBeNull()
    expect(workflowState(workflow).deferredRoutingQueue).toBeNull()
    expect(app.scheduler.getActiveJobs()).not.toContain(RECONCILIATION_JOB_NAME)
  })

  it('stop while the staggered poller is starting leaves the poller unarmed', async () => {
    app = await bootInEtagMode()
    const workflow = new WatchlistWorkflowService(app.log, app, 50)
    const state = workflowState(workflow)
    // the baseline lookup is call 1; reconcile owns the rest until the poller's own lookup
    const held = holdPrimaryUserLookup(
      app,
      (call) => call > 1 && !state.isReconciling,
    )

    const starting = workflow.startWorkflow()
    await vi.waitFor(() => expect(held.isHeld()).toBe(true), {
      timeout: 10_000,
    })
    expect(workflow.getStatus()).toBe('starting')
    const etagPoller = state.etagPoller
    if (!etagPoller) throw new Error('etag poller was not created')
    const arm = vi.spyOn(etagPoller, 'startStaggeredPolling')

    await expect(workflow.stop()).resolves.toBe(true)
    held.release()

    await expect(starting).resolves.toBe(false)
    expect(workflow.getStatus()).toBe('stopped')
    expect(arm).not.toHaveBeenCalled()
  })

  it('stop during Plex verification publishes no job or queue', async () => {
    app = await bootInEtagMode()
    const held = holdPlexPing(app)
    const workflow = new WatchlistWorkflowService(app.log, app, 50)

    const starting = workflow.startWorkflow()
    await vi.waitFor(() => expect(held.spy).toHaveBeenCalled())

    await expect(workflow.stop()).resolves.toBe(true)
    held.release()

    await expect(starting).resolves.toBe(false)
    expect(workflow.getStatus()).toBe('stopped')
    expect(workflowState(workflow).deferredRoutingQueue).toBeNull()
    expect(app.scheduler.getActiveJobs()).not.toContain(RECONCILIATION_JOB_NAME)
  })

  it('a start while stopping returns false', async () => {
    app = await bootInEtagMode()
    service = new WatchlistWorkflowService(app.log, app, 50)
    await expect(service.startWorkflow()).resolves.toBe(true)
    const held = holdReconciliationUnschedule(app)

    const stopping = service.stop()
    await vi.waitFor(() => expect(held.spy).toHaveBeenCalled())
    expect(service.getStatus()).toBe('stopping')

    await expect(service.startWorkflow()).resolves.toBe(false)
    held.release()
    await expect(stopping).resolves.toBe(true)
    expect(service.getStatus()).toBe('stopped')
  })

  it('a second start while starting returns false and does not replace the queue', async () => {
    app = await bootInEtagMode()
    const held = holdPrimaryUserLookup(app)
    service = new WatchlistWorkflowService(app.log, app, 50)

    const starting = service.startWorkflow()
    await vi.waitFor(() => expect(held.spy).toHaveBeenCalled())
    const queue = workflowState(service).deferredRoutingQueue
    expect(queue).not.toBeNull()

    await expect(service.startWorkflow()).resolves.toBe(false)
    expect(service.getStatus()).toBe('starting')
    expect(workflowState(service).deferredRoutingQueue).toBe(queue)

    held.release()
    await expect(starting).resolves.toBe(true)
    expect(service.getStatus()).toBe('running')
  })

  it('workflow deps read config reassigned by updateConfig', async () => {
    app = await bootInEtagMode()
    await app.updateConfig({ skipIfExistsOnPlex: false })
    service = new WatchlistWorkflowService(app.log, app, 50)
    const deps = workflowDeps(service)

    await app.updateConfig({ skipIfExistsOnPlex: true })

    expect(deps.config.skipIfExistsOnPlex).toBe(true)
    expect(deps.itemProcessorDeps.config.skipIfExistsOnPlex).toBe(true)
  })
})
