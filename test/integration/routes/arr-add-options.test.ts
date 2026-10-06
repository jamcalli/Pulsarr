import {
  SONARR_API_ONLY_MONITOR_OPTIONS,
  SONARR_ROLLING_MONITOR_OPTIONS,
  SONARR_UI_MONITOR_OPTIONS,
} from '@root/schemas/sonarr/season-monitoring.schema.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { SEED_WATCHLIST_ITEMS, seedAll } from '../../helpers/seeds/index.js'

const ALL_SEASON_MONITORING = [
  ...SONARR_UI_MONITOR_OPTIONS,
  ...SONARR_ROLLING_MONITOR_OPTIONS,
  ...SONARR_API_ONLY_MONITOR_OPTIONS,
]

const LEGACY_VALUE = 'firstseason'

describe('arr add options on write and read paths', () => {
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
    app.contentRouter.clearRouterRulesCache()
  })

  describe('approval routing', () => {
    const watchlistItem = SEED_WATCHLIST_ITEMS[0]

    function routing(overrides: Record<string, unknown>) {
      return {
        instanceId: 1,
        instanceType: 'sonarr',
        priority: 50,
        ...overrides,
      }
    }

    function decision(proposedRouting: Record<string, unknown>) {
      return {
        action: 'require_approval',
        approval: {
          reason: 'Needs review',
          triggeredBy: 'manual_flag',
          data: {},
          proposedRouting,
        },
      }
    }

    async function insertApproval(proposedRouting: Record<string, unknown>) {
      const [row] = await getTestDatabase()('approval_requests')
        .insert({
          user_id: watchlistItem.user_id,
          content_type: 'show',
          content_title: 'Legacy Show',
          content_key: 'legacy-show',
          content_guids: JSON.stringify(['tvdb:1']),
          router_decision: JSON.stringify(decision(proposedRouting)),
          triggered_by: 'manual_flag',
          status: 'pending',
        })
        .returning('id')
      return row.id as number
    }

    function patch(id: number, proposedRouting: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/v1/approval/requests/${id}`,
        payload: { proposedRouterDecision: decision(proposedRouting) },
      })
    }

    it('reads a stored legacy value', async () => {
      const id = await insertApproval(
        routing({ seasonMonitoring: LEGACY_VALUE }),
      )
      const res = await app.inject({
        method: 'GET',
        url: `/v1/approval/requests/${id}`,
      })
      expect(res.statusCode).toBe(200)
      expect(
        res.json().approvalRequest.proposedRouterDecision.approval
          .proposedRouting.seasonMonitoring,
      ).toBe(LEGACY_VALUE)
    })

    it('round-trips a stored legacy value', async () => {
      const id = await insertApproval(
        routing({ seasonMonitoring: LEGACY_VALUE }),
      )
      const res = await patch(
        id,
        routing({ seasonMonitoring: LEGACY_VALUE, rootFolder: '/tv' }),
      )
      expect(res.statusCode).toBe(200)
    })

    it('rejects a new unknown value', async () => {
      const id = await insertApproval(
        routing({ seasonMonitoring: LEGACY_VALUE }),
      )
      const res = await patch(id, routing({ seasonMonitoring: 'everything' }))
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe(
        'Invalid season monitoring value: everything',
      )
    })

    it.each(ALL_SEASON_MONITORING)('accepts %s', async (seasonMonitoring) => {
      const id = await insertApproval(routing({ seasonMonitoring: 'all' }))
      const res = await patch(id, routing({ seasonMonitoring }))
      expect(res.statusCode).toBe(200)
      expect(
        res.json().approvalRequest.proposedRouterDecision.approval
          .proposedRouting.seasonMonitoring,
      ).toBe(seasonMonitoring)
    })

    it('rejects an unknown value on create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/approval/requests',
        payload: {
          userId: watchlistItem.user_id,
          contentType: 'show',
          contentTitle: 'New Show',
          contentKey: 'new-show',
          routerDecision: decision(routing({ seasonMonitoring: LEGACY_VALUE })),
          triggeredBy: 'manual_flag',
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe(
        `Invalid season monitoring value: ${LEGACY_VALUE}`,
      )
    })

    it('rejects an invalid minimum availability', async () => {
      const id = await insertApproval(
        routing({ instanceType: 'radarr', minimumAvailability: 'released' }),
      )
      const res = await patch(
        id,
        routing({ instanceType: 'radarr', minimumAvailability: 'tba' }),
      )
      expect(res.statusCode).toBe(400)
    })
  })

  describe('router rules', () => {
    const sonarrRule = {
      name: 'Legacy Rule',
      target_type: 'sonarr' as const,
      target_instance_id: 1,
      condition: { operator: 'AND', conditions: [], negate: false },
    }

    async function insertRule(seasonMonitoring: string) {
      const [row] = await getTestDatabase()('router_rules')
        .insert({
          name: sonarrRule.name,
          type: 'conditional',
          criteria: JSON.stringify({ condition: sonarrRule.condition }),
          target_type: 'sonarr',
          target_instance_id: 1,
          order: 50,
          enabled: true,
          season_monitoring: seasonMonitoring,
        })
        .returning('id')
      return row.id as number
    }

    it('reads a stored legacy value', async () => {
      const id = await insertRule(LEGACY_VALUE)
      const res = await app.inject({
        method: 'GET',
        url: `/v1/content-router/rules/${id}`,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().rule.season_monitoring).toBe(LEGACY_VALUE)
    })

    it('round-trips a stored legacy value and rejects a new unknown one', async () => {
      const id = await insertRule(LEGACY_VALUE)
      const keep = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { ...sonarrRule, season_monitoring: LEGACY_VALUE },
      })
      expect(keep.statusCode).toBe(200)

      const change = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { ...sonarrRule, season_monitoring: 'everything' },
      })
      expect(change.statusCode).toBe(400)
      expect(change.json().message).toBe(
        'Invalid season monitoring value: everything',
      )
    })

    it('rejects an unknown value on create and accepts a known one', async () => {
      const bad = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule, season_monitoring: LEGACY_VALUE },
      })
      expect(bad.statusCode).toBe(400)
      expect(bad.json().message).toBe(
        `Invalid season monitoring value: ${LEGACY_VALUE}`,
      )

      const good = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule, season_monitoring: 'lastSeason' },
      })
      expect(good.statusCode).toBe(201)
      expect(good.json().rule.season_monitoring).toBe('lastSeason')
    })
  })

  describe('sonarr instances', () => {
    async function storeSeasonMonitoring(value: string) {
      await getTestDatabase()('sonarr_instances')
        .where({ id: 1 })
        .update({ season_monitoring: value })
    }

    function update(seasonMonitoring: string) {
      return app.inject({
        method: 'PUT',
        url: '/v1/sonarr/instances/1',
        payload: { seasonMonitoring },
      })
    }

    it('reads a stored legacy value', async () => {
      await storeSeasonMonitoring(LEGACY_VALUE)
      const res = await app.inject({
        method: 'GET',
        url: '/v1/sonarr/instances',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()[0].seasonMonitoring).toBe(LEGACY_VALUE)
    })

    it('round-trips a stored legacy value and rejects a new unknown one', async () => {
      await storeSeasonMonitoring(LEGACY_VALUE)
      expect((await update(LEGACY_VALUE)).statusCode).toBe(204)
      const change = await update('everything')
      expect(change.statusCode).toBe(400)
      expect(change.json().message).toBe(
        'Invalid season monitoring value: everything',
      )
    })

    it('accepts a known value', async () => {
      expect((await update('monitorSpecials')).statusCode).toBe(204)
      const row = await getTestDatabase()('sonarr_instances')
        .where({ id: 1 })
        .first()
      expect(row.season_monitoring).toBe('monitorSpecials')
    })

    it('rejects an unknown value on create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/sonarr/instances',
        payload: {
          name: 'Second Sonarr',
          baseUrl: 'http://second-sonarr:8989',
          apiKey: 'key',
          seasonMonitoring: LEGACY_VALUE,
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe(
        `Invalid season monitoring value: ${LEGACY_VALUE}`,
      )
    })
  })

  describe('radarr instances', () => {
    it('reads a stored lowercase minimum availability in canonical form', async () => {
      await getTestDatabase()('radarr_instances')
        .where({ id: 1 })
        .update({ minimum_availability: 'incinemas' })
      const res = await app.inject({
        method: 'GET',
        url: '/v1/radarr/instances',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()[0].minimumAvailability).toBe('inCinemas')
    })

    it('rejects an invalid minimum availability or monitor', async () => {
      for (const payload of [
        { minimumAvailability: 'tba' },
        { monitor: 'collectionOnly' },
      ]) {
        const res = await app.inject({
          method: 'PUT',
          url: '/v1/radarr/instances/1',
          payload,
        })
        expect(res.statusCode).toBe(400)
      }
    })
  })
})
