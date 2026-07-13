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
import { seedConfig } from '../../helpers/seeds/config.js'
import { seedInstances } from '../../helpers/seeds/instances.js'

describe('Content Router Rules API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedInstances(knex)
    app.config.authenticationMethod = 'disabled'
    app.contentRouter.clearRouterRulesCache()
  })

  const radarrRule = {
    name: 'Radarr Rule',
    target_type: 'radarr' as const,
    target_instance_id: 1,
    condition: { operator: 'AND', conditions: [], negate: false },
  }

  const sonarrRule = {
    name: 'Sonarr Rule',
    target_type: 'sonarr' as const,
    target_instance_id: 1,
    condition: { operator: 'AND', conditions: [], negate: false },
  }

  describe('monitor field persistence', () => {
    it('persists monitor on create and returns it on subsequent GET', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, monitor: 'movieOnly' },
      })
      expect(createRes.statusCode).toBe(201)
      expect(createRes.json().rule.monitor).toBe('movieOnly')

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/content-router/rules/${createRes.json().rule.id}`,
      })
      expect(getRes.statusCode).toBe(200)
      expect(getRes.json().rule.monitor).toBe('movieOnly')

      const knex = getTestDatabase()
      const row = await knex('router_rules')
        .where({ id: createRes.json().rule.id })
        .first()
      expect(row.monitor).toBe('movieOnly')
    })

    it('persists monitor on update', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, monitor: 'movieOnly' },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { monitor: 'movieAndCollection' },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().rule.monitor).toBe('movieAndCollection')

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBe('movieAndCollection')
    })
  })

  describe('target-type field validation', () => {
    it('rejects monitor on Sonarr rule create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule, monitor: 'movieOnly' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain('monitor')
    })

    it('rejects monitor on Sonarr rule update', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: sonarrRule,
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { monitor: 'movieOnly' },
      })
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain('monitor')
    })

    it('rejects series_type on Radarr rule create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, series_type: 'anime' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain('series_type')
    })

    it('rejects series_type on Radarr rule update', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: radarrRule,
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { series_type: 'anime' },
      })
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain('series_type')
    })

    it('rejects season_monitoring on Radarr rule create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, season_monitoring: 'all' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain('season_monitoring')
    })

    it('rejects season_monitoring on Radarr rule update', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: radarrRule,
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { season_monitoring: 'all' },
      })
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain('season_monitoring')
    })

    it('accepts explicit null for target-specific fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule, monitor: null },
      })
      expect(res.statusCode).toBe(201)
    })

    it('coerces string quality_profile to a number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, quality_profile: '5' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().rule.quality_profile).toBe(5)

      const knex = getTestDatabase()
      const row = await knex('router_rules')
        .where({ id: res.json().rule.id })
        .first()
      expect(row.quality_profile).toBe(5)
    })

    it('stores null for unparseable quality_profile strings', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, quality_profile: 'not-a-number' },
      })
      expect(res.statusCode).toBe(201)

      const knex = getTestDatabase()
      const row = await knex('router_rules')
        .where({ id: res.json().rule.id })
        .first()
      expect(row.quality_profile).toBeNull()
    })

    it('clears sonarr fields when a rule switches to radarr', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          season_monitoring: 'all',
          series_type: 'anime',
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { target_type: 'radarr', target_instance_id: 1 },
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.season_monitoring).toBeNull()
      expect(row.series_type).toBeNull()
    })

    it('clears monitor when a rule switches to sonarr', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, monitor: 'movieOnly' },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: { target_type: 'sonarr', target_instance_id: 1 },
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBeNull()
    })

    it('accepts sonarr fields on Sonarr rules', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          season_monitoring: 'all',
          series_type: 'anime',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().rule.season_monitoring).toBe('all')
      expect(res.json().rule.series_type).toBe('anime')
    })
  })
})
