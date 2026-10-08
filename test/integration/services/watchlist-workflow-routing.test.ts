import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import {
  type ApprovedRecords,
  indexApprovedRecords,
  routeMovie,
} from '@services/watchlist-workflow/routing/content-router.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
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
import {
  seedConfig,
  seedInstances,
  seedUserQuota,
  seedUsers,
} from '../../helpers/seeds/index.js'
import {
  appliedRadarr,
  echoAppliedRadarr,
} from '../../mocks/applied-routing.js'

describe('routeMovie with an approval record as the truth', () => {
  let fastify: FastifyInstance
  let deps: ContentRoutingDeps
  let routeItemToRadarr: ReturnType<typeof vi.fn>

  const guids = ['imdb:tt9999999', 'tmdb:99999']
  const key = 'partial-presence-key'

  const radarrItem: RadarrItem = {
    title: 'Test Comedy Movie',
    type: 'movie',
    guids,
    genres: ['Comedy'],
  }

  const presentIn = (...instanceIds: number[]): RadarrItem[] =>
    instanceIds.map((radarr_instance_id) => ({
      ...radarrItem,
      radarr_instance_id,
    }))

  const route = (
    existingMovies: RadarrItem[],
    approvedRecords?: ApprovedRecords,
  ) =>
    routeMovie(
      {
        tempItem: { title: radarrItem.title, key, type: 'movie', guids },
        userId: 1,
        userName: undefined,
        radarrItem,
        existingMovies,
        approvedRecords,
        primaryUser: null,
      },
      deps,
    )

  const routedInstanceIds = () =>
    routeItemToRadarr.mock.calls.map((call) => call[3])

  const getApprovalRequests = () =>
    getTestDatabase()('approval_requests').select('*')

  const getQuotaUsageCount = async (): Promise<number> => {
    const rows = await getTestDatabase()('quota_usage').count('* as count')
    return Number(rows[0].count)
  }

  const exhaustQuota = async (): Promise<void> => {
    await seedUserQuota(getTestDatabase(), {
      user_id: 1,
      content_type: 'movie',
      quota_limit: 1,
    })
    await fastify.quotaService.recordUsage(1, 'movie')
  }

  const radarrRouting = (instanceId: number, rootFolder: string) => ({
    instanceId,
    instanceType: 'radarr',
    qualityProfile: 7,
    rootFolder,
    tags: [],
    searchOnAdd: false,
    minimumAvailability: 'released',
  })

  const seedRecord = (
    proposedRouting: Record<string, unknown>,
    additionalRouting?: Record<string, unknown>[],
  ) =>
    getTestDatabase()('approval_requests').insert({
      user_id: 1,
      content_type: 'movie',
      content_title: radarrItem.title,
      content_key: key,
      content_guids: JSON.stringify(guids),
      router_decision: JSON.stringify({
        action: 'require_approval',
        approval: {
          reason: 'seeded',
          triggeredBy: 'router_rule',
          data: {},
          proposedRouting,
          additionalRouting,
        },
      }),
      triggered_by: 'router_rule',
      status: 'approved',
    })

  const insertRadarrInstance = (id: number) =>
    getTestDatabase()('radarr_instances').insert({
      id,
      name: `Radarr ${id}`,
      base_url: `http://test-radarr-${id}:7878`,
      api_key: `test_radarr_api_key_${id}`,
      quality_profile: '1',
      root_folder: `/data/movies${id}`,
      is_default: false,
      is_enabled: true,
      tags: JSON.stringify([]),
      synced_instances: JSON.stringify([]),
    })

  const seedComedyRule = (id: number, instanceId: number) =>
    getTestDatabase()('router_rules').insert({
      id,
      name: `Comedy Route ${instanceId}`,
      type: 'conditional',
      target_type: 'radarr',
      target_instance_id: instanceId,
      root_folder: `/data/comedy-${instanceId}`,
      quality_profile: 2,
      tags: JSON.stringify([]),
      order: 50,
      enabled: true,
      search_on_add: true,
      always_require_approval: false,
      bypass_user_quotas: false,
      criteria: JSON.stringify({
        condition: {
          negate: false,
          operator: 'AND',
          conditions: [
            {
              field: 'genres',
              value: 'Comedy',
              negate: false,
              operator: 'contains',
            },
          ],
        },
      }),
    })

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedUsers(knex)
    await seedInstances(knex)
    await insertRadarrInstance(2)
    await seedComedyRule(50, 1)
    await seedComedyRule(51, 2)
    fastify.contentRouter.clearRouterRulesCache()

    routeItemToRadarr = vi.fn(echoAppliedRadarr())
    fastify.radarrManager.routeItemToRadarr =
      routeItemToRadarr as unknown as RadarrManagerService['routeItemToRadarr']
    fastify.notifications.sendWatchlistCapReached = vi.fn()

    deps = {
      logger: fastify.log,
      config: fastify.config,
      db: fastify.db,
      fastify,
      state: new WorkflowState(),
      contentRouter: fastify.contentRouter,
      sonarrManager: fastify.sonarrManager,
      radarrManager: fastify.radarrManager,
      plexServerService: fastify.plexServerService,
      plexService: fastify.plexWatchlist,
      notifications: fastify.notifications,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips when the record names only the present instance', async () => {
    await seedRecord(radarrRouting(1, '/stored-1'))
    await getTestDatabase()('radarr_instances')
      .where({ id: 1 })
      .update({ synced_instances: JSON.stringify([2]) })

    const result = await route(presentIn(1))

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(routeItemToRadarr).not.toHaveBeenCalled()
  })

  it('fills a missing record destination with its stored settings and no gate', async () => {
    await seedRecord(radarrRouting(1, '/stored-1'), [
      radarrRouting(2, '/stored-2'),
    ])
    await exhaustQuota()
    const usageBefore = await getQuotaUsageCount()

    const result = await route(presentIn(1))

    expect(result).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([2])
    expect(routeItemToRadarr.mock.calls[0][5]).toMatchObject({
      rootFolder: '/stored-2',
      qualityProfile: 7,
      searchOnAdd: false,
    })
    expect(await getQuotaUsageCount()).toBe(usageBefore)
    expect(await getApprovalRequests()).toHaveLength(1)
  })

  it('replays the stored root folder after the instance default changed', async () => {
    await getTestDatabase()('router_rules').del()
    fastify.contentRouter.clearRouterRulesCache()
    await seedRecord(radarrRouting(1, '/stored-x'))
    await getTestDatabase()('radarr_instances')
      .where({ id: 1 })
      .update({ root_folder: '/changed-y' })

    const result = await route(presentIn())

    expect(result).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([1])
    expect(routeItemToRadarr.mock.calls[0][5]).toMatchObject({
      rootFolder: '/stored-x',
    })
  })

  it('skips a partially present item that has no record', async () => {
    const result = await route(presentIn(1))

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(routeItemToRadarr).not.toHaveBeenCalled()
    expect(await getApprovalRequests()).toHaveLength(0)
  })

  it('skips when every record destination already has it', async () => {
    await seedRecord(radarrRouting(1, '/stored-1'), [
      radarrRouting(2, '/stored-2'),
    ])

    const result = await route(presentIn(1, 2))

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(routeItemToRadarr).not.toHaveBeenCalled()
  })

  it('completes a record even when the item is on Plex', async () => {
    await seedRecord(radarrRouting(1, '/stored-1'), [
      radarrRouting(2, '/stored-2'),
    ])
    vi.spyOn(
      fastify.plexServerService,
      'checkExistenceAcrossServers',
    ).mockResolvedValue(true)
    deps.config = { ...fastify.config, skipIfExistsOnPlex: true }

    expect(await route(presentIn(1))).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([2])
    expect(await route(presentIn())).toEqual({
      routed: false,
      skippedReason: 'exists-on-plex',
    })
  })

  it('completes a record destination outside the current targets when every target has it', async () => {
    await insertRadarrInstance(3)
    await seedRecord(radarrRouting(1, '/stored-1'), [
      radarrRouting(3, '/stored-3'),
    ])
    const approvedRecords = indexApprovedRecords(
      await fastify.db.getAllApprovedApprovalRequests(),
    )

    const result = await route(presentIn(1, 2), approvedRecords)

    expect(result).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([3])
    expect(routeItemToRadarr.mock.calls[0][5]).toMatchObject({
      rootFolder: '/stored-3',
    })
  })

  it('does not re-add a record destination outside the current targets that has it', async () => {
    await insertRadarrInstance(3)
    await seedRecord(radarrRouting(1, '/stored-1'), [
      radarrRouting(2, '/stored-2'),
      radarrRouting(3, '/stored-3'),
    ])

    const result = await route(presentIn(1, 3))

    expect(result).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([2])
  })

  it('completes a destination whose add failed on the first pass', async () => {
    routeItemToRadarr.mockImplementation(
      async (_item: unknown, _key: string, _userId: number, id: number) => {
        if (id === 2) throw new Error('down')
        return appliedRadarr({ instanceId: id })
      },
    )

    expect(await route(presentIn())).toEqual({ routed: true })
    expect(await getApprovalRequests()).toHaveLength(1)

    routeItemToRadarr.mockClear()
    routeItemToRadarr.mockImplementation(echoAppliedRadarr())

    expect(await route(presentIn(1))).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([2])
    expect(routeItemToRadarr.mock.calls[0][5]).toMatchObject({
      rootFolder: '/data/comedy-2',
      qualityProfile: 2,
    })
  })

  it('skips the item when every target already has it', async () => {
    const result = await route(presentIn(1, 2))

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(routeItemToRadarr).not.toHaveBeenCalled()
  })

  it('routes to every target when none has it', async () => {
    const result = await route(presentIn())

    expect(result).toEqual({ routed: true })
    expect(routedInstanceIds()).toEqual([1, 2])
  })
})
