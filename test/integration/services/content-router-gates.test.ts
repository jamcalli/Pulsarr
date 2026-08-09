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
} from '../../helpers/seeds/index.js'

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

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedUsers(knex)
    await seedInstances(knex)
    await seedRouterRules(knex)
    fastify.contentRouter.clearRouterRulesCache()

    routeItemToRadarr = vi.fn().mockResolvedValue(undefined)
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
      await knex('radarr_instances').insert({
        id: 2,
        name: 'Synced Radarr',
        base_url: 'http://test-radarr-2:7878',
        api_key: 'test_radarr_api_key_2',
        quality_profile: '1',
        root_folder: '/data/movies2',
        is_default: false,
        is_enabled: true,
        tags: JSON.stringify([]),
        synced_instances: JSON.stringify([]),
      })
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

  describe('synced-instance default routing', () => {
    const seedSyncedInstance = async (
      syncedInstances: number[],
    ): Promise<void> => {
      const knex = getTestDatabase()
      await knex('radarr_instances').insert({
        id: 2,
        name: 'Synced Radarr',
        base_url: 'http://test-radarr-2:7878',
        api_key: 'test_radarr_api_key_2',
        quality_profile: '1',
        root_folder: '/data/movies2',
        monitor: 'none',
        is_default: false,
        is_enabled: true,
        tags: JSON.stringify([]),
        synced_instances: JSON.stringify([]),
      })
      await knex('radarr_instances')
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
      // Each instance is routed with its OWN defaults, not the primary's
      expect(primaryArgs[3]).toBe(1)
      expect(primaryArgs[5]).toBe('/data/movies')
      expect(primaryArgs[9]).toBe('announced')
      expect(primaryArgs[10]).toBe('movieOnly')
      expect(syncedArgs[3]).toBe(2)
      expect(syncedArgs[5]).toBe('/data/movies2')
      expect(syncedArgs[10]).toBe('none')

      // The auto-approval record must label the tail as sync expansion
      const requests = await getApprovalRequests()
      expect(requests).toHaveLength(1)
      expect(requests[0].status).toBe('auto_approved')
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
      // (item, key, userId, instanceId, syncing, rootFolder, profile, tags, searchOnAdd, minAvailability, monitor)
      expect(args[3]).toBe(1)
      expect(args[5]).toBe('/data/comedy')
      expect(args[6]).toBe(2)
      expect(args[7]).toEqual([])
      expect(Boolean(args[8])).toBe(true)
      // Rules carry no minimumAvailability - the manager falls through to
      // the instance default
      expect(args[9]).toBeUndefined()
      expect(args[10]).toBe('movieAndCollection')

      expect(result.routingDetails).toHaveLength(1)
      expect(result.routingDetails[0].instanceId).toBe(1)
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

    it('routes to multiple matched instances in priority order without duplicates', async () => {
      const knex = getTestDatabase()
      await knex('radarr_instances').insert({
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
      })
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
      expect(args[5]).toBe('/data/approved')
      // The approved monitor value must reach the add call
      expect(args[10]).toBe('none')
    })
  })
})
