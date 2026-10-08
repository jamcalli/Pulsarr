import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { ContentItem } from '@root/types/router.types.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
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
import {
  seedConfig,
  seedInstances,
  seedRouterRules,
  seedUserQuota,
  seedUsers,
  seedWatchlist,
} from '../../helpers/seeds/index.js'
import {
  appliedRadarr,
  echoAppliedRadarr,
} from '../../mocks/applied-routing.js'

describe('routeContent gates', () => {
  let fastify: FastifyInstance
  let routeItemToRadarr: ReturnType<typeof vi.fn>

  const comedyMovie: ContentItem = {
    title: 'Test Comedy Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Comedy'],
  }

  const dramaMovie: ContentItem = {
    title: 'Test Drama Movie',
    type: 'movie',
    guids: ['imdb:tt1234567', 'tmdb:12345'],
    genres: ['Drama', 'Thriller'],
  }

  const getApprovalRequests = () =>
    getTestDatabase()('approval_requests').select('*')

  const getQuotaUsageCount = async (): Promise<number> => {
    const rows = await getTestDatabase()('quota_usage').count('* as count')
    return Number(rows[0].count)
  }

  const clearRouterRules = async () => {
    await getTestDatabase()('router_rules').del()
    fastify.contentRouter.clearRouterRulesCache()
  }

  const seedComedyRule = async (
    overrides: Record<string, unknown> = {},
  ): Promise<void> => {
    await getTestDatabase()('router_rules').insert({
      id: 50,
      name: 'Comedy Route',
      type: 'conditional',
      target_type: 'radarr',
      target_instance_id: 1,
      root_folder: '/data/comedy',
      quality_profile: 2,
      tags: JSON.stringify([]),
      order: 50,
      enabled: true,
      search_on_add: true,
      always_require_approval: false,
      bypass_user_quotas: false,
      monitor: 'movieAndCollection',
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
      ...overrides,
    })
    fastify.contentRouter.clearRouterRulesCache()
  }

  // Consumes quota slots for today so the next request exceeds the limit
  const useUpQuota = async (userId: number, count: number): Promise<void> => {
    for (let i = 0; i < count; i++) {
      await fastify.quotaService.recordUsage(userId, 'movie')
    }
  }

  const insertSecondRadarrInstance = async (
    overrides: Record<string, unknown> = {},
  ): Promise<void> => {
    await getTestDatabase()('radarr_instances').insert({
      id: 2,
      name: 'Second Radarr',
      base_url: 'http://test-radarr-2:7878',
      api_key: 'test_radarr_api_key_2',
      quality_profile: '1',
      root_folder: '/data/movies2',
      is_default: false,
      is_enabled: true,
      tags: JSON.stringify([]),
      synced_instances: JSON.stringify([]),
      ...overrides,
    })
  }

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
    await seedRouterRules(knex)
    fastify.contentRouter.clearRouterRulesCache()

    routeItemToRadarr = vi.fn(echoAppliedRadarr())
    fastify.radarrManager.routeItemToRadarr =
      routeItemToRadarr as unknown as RadarrManagerService['routeItemToRadarr']
    fastify.notifications.sendWatchlistCapReached = vi.fn()
  })

  describe('no-rules branch', () => {
    beforeEach(async () => {
      await clearRouterRules()
    })

    it('routes to the default instance and records an auto-approval', async () => {
      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-normal-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].status).toBe('auto_approved')
    })

    it('consumes one quota slot on successful default routing', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-quota-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('creates a quota_exceeded approval request instead of routing when over quota', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await useUpQuota(1, 1)

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-exceeded-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('quota_exceeded')
      expect(requests[0].status).toBe('pending')
      // The failed attempt must not burn a slot beyond the existing usage
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('routes without consuming quota when the user has bypass_approval', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
        bypass_approval: true,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-bypass-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(await getQuotaUsageCount()).toBe(0)
    })

    it('proposes the synced-instance tail on default-routing approval requests', async () => {
      const knex = getTestDatabase()
      await insertSecondRadarrInstance()
      await knex('radarr_instances')
        .where('id', 1)
        .update('synced_instances', JSON.stringify([2]))

      // Seed user 4 has requires_approval: true
      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'default-synced-approval-key',
        { userId: 4, userName: 'No Sync User' },
      )

      expect(result.routedInstances).toEqual([])

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)

      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      // Default routing tail IS sync expansion - approval must fan out to it
      expect(decision.approval.proposedRouting.syncedInstances).toEqual([2])
    })

    it('creates a manual_flag approval request for a requires_approval user', async () => {
      // Seed user 4 has requires_approval: true
      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-manual-key',
        { userId: 4, userName: 'No Sync User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('manual_flag')
    })

    it('skips silently when the watchlist cap is reached', async () => {
      const knex = getTestDatabase()
      await seedUserQuota(knex, {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
        watchlist_cap: 1,
      })
      await knex('watchlist_items').insert([
        {
          user_id: 1,
          title: 'Cap Movie 1',
          key: 'cap-movie-1',
          type: 'movie',
          guids: JSON.stringify(['tmdb:1001']),
          genres: JSON.stringify(['Comedy']),
          status: 'pending',
        },
        {
          user_id: 1,
          title: 'Cap Movie 2',
          key: 'cap-movie-2',
          type: 'movie',
          guids: JSON.stringify(['tmdb:1002']),
          genres: JSON.stringify(['Comedy']),
          status: 'pending',
        },
      ])

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-capped-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
      expect(await getApprovalRequests()).toHaveLength(0)
      expect(await getQuotaUsageCount()).toBe(0)
      expect(
        fastify.notifications.sendWatchlistCapReached,
      ).toHaveBeenCalledTimes(1)
    })

    it('does not consume quota when routing lands nowhere (skip flag on)', async () => {
      const knex = getTestDatabase()
      await knex('radarr_instances')
        .where('id', 1)
        .update('skip_default_routing_when_no_match', true)
      await seedUserQuota(knex, {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'no-rules-nowhere-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
      // Nothing was routed, so no quota slot may be burned
      expect(await getQuotaUsageCount()).toBe(0)
    })
  })

  describe('fallback branch (rules exist, none match)', () => {
    it('falls back to default routing when no rule matches', async () => {
      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'fallback-normal-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
    })

    it('creates a quota_exceeded approval request instead of routing when over quota', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await useUpQuota(1, 1)

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'fallback-exceeded-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('quota_exceeded')
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('does not consume quota when routing lands nowhere (skip flag on)', async () => {
      const knex = getTestDatabase()
      await knex('radarr_instances')
        .where('id', 1)
        .update('skip_default_routing_when_no_match', true)
      await seedUserQuota(knex, {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'fallback-nowhere-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(await getQuotaUsageCount()).toBe(0)
    })
  })

  describe('rules fetch failure', () => {
    const watchlistMovie: ContentItem = {
      title: 'Night of the Living Dead',
      type: 'movie',
      guids: ['imdb:tt0063350', 'tmdb:10331'],
      genres: ['Horror'],
    }
    const watchlistKey = '5d77683585719b001f3a3946'

    const getWatchlistRow = () =>
      getTestDatabase()('watchlist_items')
        .where({ user_id: 1, key: watchlistKey })
        .first()

    beforeEach(async () => {
      await seedWatchlist(getTestDatabase())
      fastify.contentRouter.clearRouterRulesCache()
    })

    it('leaves the item unrouted and unmarked, then routes it on the next pass', async () => {
      const before = await getWatchlistRow()
      const getAllRouterRules = vi
        .spyOn(fastify.db, 'getAllRouterRules')
        .mockRejectedValueOnce(new Error('rules read failed'))

      await expect(
        fastify.contentRouter.routeContent(watchlistMovie, watchlistKey, {
          userId: 1,
          userName: 'Test User',
        }),
      ).rejects.toThrow('rules read failed')

      expect(routeItemToRadarr).not.toHaveBeenCalled()
      expect(await getApprovalRequests()).toHaveLength(0)
      expect(await getQuotaUsageCount()).toBe(0)
      const after = await getWatchlistRow()
      expect(after.radarr_instance_id).toBeNull()
      expect(after.status).toBe(before.status)

      getAllRouterRules.mockRestore()
      const retry = await fastify.contentRouter.routeContent(
        watchlistMovie,
        watchlistKey,
        { userId: 1, userName: 'Test User' },
      )
      expect(retry.routedInstances).toEqual([1])
    })

    it('fails the target lookup instead of falling back to the default instance', async () => {
      const getAllRouterRules = vi
        .spyOn(fastify.db, 'getAllRouterRules')
        .mockRejectedValueOnce(new Error('rules read failed'))

      await expect(
        fastify.contentRouter.getTargetInstances(watchlistMovie, {
          userId: 1,
          contentType: 'movie',
          itemKey: watchlistKey,
        }),
      ).rejects.toThrow('rules read failed')

      getAllRouterRules.mockRestore()
    })
  })

  describe('synced-instance default routing', () => {
    const seedSyncedInstance = async (
      syncedInstances: number[],
    ): Promise<void> => {
      await insertSecondRadarrInstance({ monitor: 'none' })
      await getTestDatabase()('radarr_instances')
        .where('id', 1)
        .update('synced_instances', JSON.stringify(syncedInstances))
    }

    it('fans out to default plus synced instances when no rule matches', async () => {
      await seedSyncedInstance([2])

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'synced-fanout-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1, 2])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(2)
      const [primaryArgs, syncedArgs] = routeItemToRadarr.mock.calls
      // empty settings make the manager resolve each instance's own defaults
      expect(primaryArgs[3]).toBe(1)
      expect(primaryArgs[5]).toEqual({})
      expect(syncedArgs[3]).toBe(2)
      expect(syncedArgs[5]).toEqual({})
      expect(result.routingDetails.map((d) => d.instanceId)).toEqual([1, 2])

      // The auto-approval record must label the tail as sync expansion
      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].status).toBe('auto_approved')
      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      expect(decision.approval.proposedRouting.syncedInstances).toEqual([2])
    })

    it('keeps the primary on the record when only a synced instance took the add', async () => {
      await seedSyncedInstance([2])
      routeItemToRadarr.mockImplementation(
        async (_item: unknown, _key: string, _userId: number, id: number) => {
          if (id === 1) throw new Error('down')
          return appliedRadarr({ instanceId: id })
        },
      )

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'synced-primary-failed-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([2])
      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      expect(decision.approval.proposedRouting.syncedInstances).toEqual([2])
    })

    it('skips unknown synced instance ids', async () => {
      await seedSyncedInstance([2, 99])

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'synced-unknown-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1, 2])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(2)
    })

    it('consumes one quota slot for a multi-instance default route', async () => {
      await seedSyncedInstance([2])
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'synced-quota-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1, 2])
      // One content item, one slot - regardless of instance fan-out
      expect(await getQuotaUsageCount()).toBe(1)
    })
  })

  describe('decisions branch (rule matched)', () => {
    it('routes with the rule settings, including monitor', async () => {
      await seedComedyRule()

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-normal-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
      const args = routeItemToRadarr.mock.calls[0]
      expect(args[3]).toBe(1)
      expect(args[5]).toMatchObject({
        rootFolder: '/data/comedy',
        qualityProfile: 2,
        tags: [],
        minimumAvailability: undefined,
        monitor: 'movieAndCollection',
      })
      expect(Boolean(args[5].searchOnAdd)).toBe(true)

      expect(result.routingDetails).toHaveLength(1)
      expect(result.routingDetails[0].instanceId).toBe(1)

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].status).toBe('auto_approved')
      expect(requests[0].router_rule_id).toBe(50)
    })

    it('creates a router_rule approval request without syncedInstances fan-out', async () => {
      await seedComedyRule({
        always_require_approval: true,
        approval_reason: 'Comedy needs a second look',
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-approval-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('router_rule')

      const decision = JSON.parse(requests[0].router_decision)
      // The stored routing must carry the rule's settings so approving the
      // request routes with them, not the instance defaults
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      expect(decision.approval.proposedRouting.rootFolder).toBe('/data/comedy')
      expect(decision.approval.proposedRouting.qualityProfile).toBe(2)
      expect(decision.approval.proposedRouting.monitor).toBe(
        'movieAndCollection',
      )
      // Rule-matched tails are independent targets, not sync mirrors -
      // populating syncedInstances here would fan out on approval
      expect(decision.approval.proposedRouting.syncedInstances).toBeUndefined()
    })

    it('stores the matched rule id on a router_rule approval request', async () => {
      await seedComedyRule({ always_require_approval: true })

      await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-rule-id-key',
        { userId: 1, userName: 'Test User' },
      )

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].router_rule_id).toBe(50)
    })

    it('creates a quota_exceeded approval request instead of routing when over quota', async () => {
      await seedComedyRule()
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await useUpQuota(1, 1)

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-exceeded-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('quota_exceeded')
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('routes an over-quota user without consuming when the rule bypasses quotas', async () => {
      await seedComedyRule({ bypass_user_quotas: true })
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await useUpQuota(1, 1)

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-bypass-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('consumes quota when approving a flagged user request', async () => {
      await seedComedyRule()
      await seedUserQuota(getTestDatabase(), {
        user_id: 4,
        content_type: 'movie',
        quota_limit: 10,
      })
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'flagged-consume-key',
        { userId: 4, userName: 'No Sync User' },
      )
      const [request] = await getApprovalRequests()

      const approval = await fastify.approvalService.approveAndRoute(
        request.id,
        1,
      )

      expect(approval.success).toBe(true)
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('skips quota when approving a flagged user request a matching rule bypasses', async () => {
      await seedComedyRule({ bypass_user_quotas: true })
      await seedUserQuota(getTestDatabase(), {
        user_id: 4,
        content_type: 'movie',
        quota_limit: 10,
      })
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'flagged-bypass-key',
        { userId: 4, userName: 'No Sync User' },
      )
      const [request] = await getApprovalRequests()
      expect(request.triggered_by).toBe('manual_flag')

      const approval = await fastify.approvalService.approveAndRoute(
        request.id,
        1,
      )

      expect(approval.success).toBe(true)
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
      expect(await getQuotaUsageCount()).toBe(0)
    })

    it('routes to multiple matched instances in priority order without duplicates', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 10, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Route High',
        order: 90,
        target_instance_id: 2,
      })
      await seedComedyRule({
        id: 52,
        name: 'Comedy Route Duplicate',
        order: 5,
        target_instance_id: 2,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-priority-key',
        { userId: 1, userName: 'Test User' },
      )

      // Higher order value wins; instance 2 matched twice but routes once
      expect(result.routedInstances).toEqual([2, 1])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(2)
    })

    it('ranks an order 0 rule below an order 10 rule', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 0, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Route Ten',
        order: 10,
        target_instance_id: 2,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'decisions-order-zero-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([2, 1])
    })
  })

  describe('several matching rules', () => {
    const seedNoApprovalAndApprovalRules = async (
      overrides: Record<string, unknown> = {},
    ): Promise<void> => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 80, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Review',
        order: 60,
        target_instance_id: 2,
        root_folder: '/data/review',
        always_require_approval: true,
        ...overrides,
      })
    }

    it('requires approval when a lower matching rule demands it', async () => {
      await seedNoApprovalAndApprovalRules()

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-approval-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].triggered_by).toBe('router_rule')
      expect(requests[0].router_rule_id).toBe(51)

      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      expect(decision.approval.proposedRouting.syncedInstances).toBeUndefined()
      expect(decision.approval.additionalRouting).toEqual([
        expect.objectContaining({ instanceId: 2, rootFolder: '/data/review' }),
      ])
    })

    it('routes the approved request to every matched instance with its own settings', async () => {
      await seedNoApprovalAndApprovalRules()
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-approve-key',
        { userId: 1, userName: 'Test User' },
      )
      const [request] = await getApprovalRequests()

      const approval = await fastify.approvalService.approveAndRoute(
        request.id,
        1,
      )

      expect(approval.success).toBe(true)
      expect(routeItemToRadarr).toHaveBeenCalledTimes(2)
      const [primary, additional] = routeItemToRadarr.mock.calls
      expect(primary[3]).toBe(1)
      expect(primary[4]).toBe(false)
      expect(primary[5]).toMatchObject({ rootFolder: '/data/comedy' })
      expect(additional[3]).toBe(2)
      expect(additional[4]).toBe(false)
      expect(additional[5]).toMatchObject({ rootFolder: '/data/review' })
    })

    it('rolls the approval back when any instance fails', async () => {
      await seedNoApprovalAndApprovalRules()
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-rollback-key',
        { userId: 1, userName: 'Test User' },
      )
      const [request] = await getApprovalRequests()
      routeItemToRadarr
        .mockImplementationOnce(echoAppliedRadarr())
        .mockRejectedValueOnce(new Error('instance 2 down'))

      const approval = await fastify.approvalService.approveAndRoute(
        request.id,
        1,
        'looks good',
      )

      expect(approval).toMatchObject({ success: false, rolledBack: true })
      expect(approval.error).toContain('Second Radarr (id 2)')
      const [rolledBack] = await getApprovalRequests()
      expect(rolledBack.status).toBe('pending')
      expect(rolledBack.approval_notes).toBeNull()
      expect(rolledBack.approved_by).toBeNull()
      expect(await getQuotaUsageCount()).toBe(0)
    })

    it('approves when an instance already holds the item', async () => {
      await seedNoApprovalAndApprovalRules()
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-existing-key',
        { userId: 1, userName: 'Test User' },
      )
      const [request] = await getApprovalRequests()
      routeItemToRadarr
        .mockImplementationOnce(echoAppliedRadarr())
        .mockRejectedValueOnce(new Error('This movie has already been added'))

      const approval = await fastify.approvalService.approveAndRoute(
        request.id,
        1,
      )

      expect(approval.success).toBe(true)
      expect(routeItemToRadarr.mock.calls.map((call) => call[3])).toEqual([
        1, 2,
      ])
      const [approved] = await getApprovalRequests()
      expect(approved.status).toBe('approved')
    })

    it('replays an approved request to every matched instance', async () => {
      await seedNoApprovalAndApprovalRules()
      await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-replay-key',
        { userId: 1, userName: 'Test User' },
      )
      await getTestDatabase()('approval_requests').update({
        status: 'approved',
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-replay-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1, 2])
      expect(result.routingDetails).toEqual([
        expect.objectContaining({ instanceId: 1, ruleId: 50 }),
        expect.objectContaining({ instanceId: 2, ruleId: 51 }),
      ])
    })

    it('honours a quota bypass set on a lower matching rule', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 80, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Bypass',
        order: 60,
        target_instance_id: 2,
        bypass_user_quotas: true,
      })
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await useUpQuota(1, 1)

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-bypass-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1, 2])
      expect(await getQuotaUsageCount()).toBe(1)
    })

    it('stores every applied routing on the auto-approval record', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 80, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Second',
        order: 60,
        target_instance_id: 2,
      })

      await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-auto-key',
        { userId: 1, userName: 'Test User' },
      )

      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].status).toBe('auto_approved')
      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting.instanceId).toBe(1)
      expect(decision.approval.additionalRouting).toEqual([
        expect.objectContaining({ instanceId: 2 }),
      ])
    })

    it('names a decided instance whose add failed with its rule settings', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 80, target_instance_id: 1 })
      await seedComedyRule({
        id: 51,
        name: 'Comedy Second',
        order: 60,
        target_instance_id: 2,
        root_folder: '/data/second',
      })
      routeItemToRadarr.mockImplementation(
        async (_item: unknown, _key: string, _userId: number, id: number) => {
          if (id === 2) throw new Error('down')
          return appliedRadarr({ instanceId: id, rootFolder: '/applied' })
        },
      )

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-partial-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      const decision = JSON.parse(requests[0].router_decision)
      expect(decision.approval.proposedRouting).toMatchObject({
        instanceId: 1,
        rootFolder: '/applied',
        ruleId: 50,
      })
      expect(decision.approval.additionalRouting).toEqual([
        expect.objectContaining({
          instanceId: 2,
          rootFolder: '/data/second',
          ruleId: 51,
        }),
      ])
    })

    it('writes no record when every add fails', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ id: 50, order: 80, target_instance_id: 1 })
      await seedComedyRule({ id: 51, order: 60, target_instance_id: 2 })
      routeItemToRadarr.mockRejectedValue(new Error('down'))

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'several-failed-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(await getApprovalRequests()).toHaveLength(0)
    })
  })

  describe('placeholder instances', () => {
    const makeRadarrPlaceholder = (id: number) =>
      getTestDatabase()('radarr_instances')
        .where('id', id)
        .update('api_key', ARR_API_KEY_PLACEHOLDER)

    beforeEach(async () => {
      await clearRouterRules()
    })

    it('skips a placeholder default without consuming quota', async () => {
      await makeRadarrPlaceholder(1)
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 5,
      })

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'placeholder-default-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
      expect(await getQuotaUsageCount()).toBe(0)
      expect(await getApprovalRequests()).toHaveLength(0)
    })

    it('writes no approval request for a placeholder default', async () => {
      await makeRadarrPlaceholder(1)

      // Seed user 4 has requires_approval: true
      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'placeholder-approval-key',
        { userId: 4, userName: 'No Sync User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(await getApprovalRequests()).toHaveLength(0)
    })

    it('still sends an explicit placeholder rule target to the manager', async () => {
      await insertSecondRadarrInstance({ api_key: ARR_API_KEY_PLACEHOLDER })
      await seedComedyRule({ target_instance_id: 2 })
      routeItemToRadarr.mockRejectedValue(
        new Error('Radarr instance "Second Radarr" is not set up'),
      )

      const result = await fastify.contentRouter.routeContent(
        comedyMovie,
        'placeholder-rule-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
      expect(routeItemToRadarr.mock.calls[0][3]).toBe(2)
      expect(result.routedInstances).toEqual([])
    })
  })

  describe('sync operations (routeSyncTarget)', () => {
    const syncRoute = (item: ContentItem, key: string) =>
      fastify.contentRouter.routeContent(item, key, {
        userId: 1,
        userName: 'Test User',
        syncing: true,
        syncTargetInstanceId: 2,
      })

    it('routes with the matching rule settings and bypasses the gates', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ target_instance_id: 2 })
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })

      const result = await syncRoute(comedyMovie, 'sync-matched-key')

      expect(result.routedInstances).toEqual([2])
      const args = routeItemToRadarr.mock.calls[0]
      expect(args[3]).toBe(2)
      expect(args[4]).toBe(true)
      expect(args[5]).toMatchObject({
        rootFolder: '/data/comedy',
        monitor: 'movieAndCollection',
      })

      // Sync is internal data movement - no approval records, no quota
      expect(await getApprovalRequests()).toHaveLength(0)
      expect(await getQuotaUsageCount()).toBe(0)
    })

    it('blocks the sync when rules route the content elsewhere', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ target_instance_id: 1 })

      const result = await syncRoute(comedyMovie, 'sync-elsewhere-key')

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
    })

    it('blocks the sync when rules target the instance but none matched', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({
        target_instance_id: 2,
        criteria: JSON.stringify({
          condition: {
            negate: false,
            operator: 'AND',
            conditions: [
              {
                field: 'genres',
                value: 'Drama',
                negate: false,
                operator: 'contains',
              },
            ],
          },
        }),
      })

      const result = await syncRoute(comedyMovie, 'sync-unmatched-key')

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
    })

    it('routes with instance defaults when no rule governs the sync target', async () => {
      await insertSecondRadarrInstance()
      // Seeded Drama rules target instance 1 only, comedy matches none

      const result = await syncRoute(comedyMovie, 'sync-ungoverned-key')

      expect(result.routedInstances).toEqual([2])
      const args = routeItemToRadarr.mock.calls[0]
      expect(args[3]).toBe(2)
      expect(args[4]).toBe(true)
      expect(args[5]).toEqual({})
      expect(await getQuotaUsageCount()).toBe(0)
    })

    it('routes straight to the sync target when no rules exist at all', async () => {
      await insertSecondRadarrInstance()
      await getTestDatabase()('router_rules').del()
      fastify.contentRouter.clearRouterRulesCache()

      const result = await syncRoute(comedyMovie, 'sync-no-rules-key')

      expect(result.routedInstances).toEqual([2])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
    })

    it('propagates add failures instead of reporting a rule block', async () => {
      await insertSecondRadarrInstance()
      await seedComedyRule({ target_instance_id: 2 })
      routeItemToRadarr.mockRejectedValueOnce(new Error('Radarr unavailable'))

      await expect(
        syncRoute(comedyMovie, 'sync-fail-matched-key'),
      ).rejects.toThrow('Radarr unavailable')
    })

    it('propagates add failures on the ungoverned path too', async () => {
      await insertSecondRadarrInstance()
      routeItemToRadarr.mockRejectedValueOnce(new Error('Radarr unavailable'))

      await expect(
        syncRoute(comedyMovie, 'sync-fail-ungoverned-key'),
      ).rejects.toThrow('Radarr unavailable')
    })
  })

  describe('existing approval requests', () => {
    it('returns empty without routing when a pending request exists', async () => {
      const knex = getTestDatabase()
      await knex('approval_requests').insert({
        user_id: 1,
        content_type: 'movie',
        content_title: dramaMovie.title,
        content_key: 'existing-pending-key',
        content_guids: JSON.stringify(dramaMovie.guids),
        router_decision: JSON.stringify({ action: 'require_approval' }),
        triggered_by: 'router_rule',
        status: 'pending',
      })

      const result = await fastify.contentRouter.routeContent(
        dramaMovie,
        'existing-pending-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([])
      expect(routeItemToRadarr).not.toHaveBeenCalled()
      expect(await getApprovalRequests()).toHaveLength(1)
    })

    it('routes an approved request using its stored routing, including monitor', async () => {
      const knex = getTestDatabase()
      await knex('approval_requests').insert({
        user_id: 1,
        content_type: 'movie',
        content_title: dramaMovie.title,
        content_key: 'existing-approved-key',
        content_guids: JSON.stringify(dramaMovie.guids),
        router_decision: JSON.stringify({
          action: 'require_approval',
          approval: {
            reason: 'test',
            triggeredBy: 'router_rule',
            proposedRouting: {
              instanceId: 1,
              instanceType: 'radarr',
              qualityProfile: 2,
              rootFolder: '/data/approved',
              tags: [],
              searchOnAdd: true,
              minimumAvailability: 'released',
              monitor: 'none',
            },
          },
        }),
        triggered_by: 'router_rule',
        status: 'approved',
      })

      const result = await fastify.contentRouter.routeContent(
        dramaMovie,
        'existing-approved-key',
        { userId: 1, userName: 'Test User' },
      )

      expect(result.routedInstances).toEqual([1])
      expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
      const args = routeItemToRadarr.mock.calls[0]
      expect(args[5]).toMatchObject({
        rootFolder: '/data/approved',
        monitor: 'none',
      })
    })
  })
})
