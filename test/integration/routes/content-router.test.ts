import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pluginsFixture from '../../fixtures/content-router-plugins.json' with {
  type: 'json',
}
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

  describe('evaluator plugin routes', () => {
    it('lists the loaded evaluators', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/content-router/plugins',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(pluginsFixture.plugins)
    })

    it('describes every evaluator field and operator', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/content-router/plugins/metadata',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(pluginsFixture.metadata)
    })
  })

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
        payload: { ...radarrRule, monitor: 'movieAndCollection' },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().rule.monitor).toBe('movieAndCollection')

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBe('movieAndCollection')
    })
  })

  describe('full-replace update semantics', () => {
    it('rejects sparse update payloads', async () => {
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
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain('name')
    })

    it('clears fields omitted from the update payload', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...radarrRule,
          monitor: 'movieOnly',
          quality_profile: 5,
          root_folder: '/data/movies',
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: radarrRule,
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBeNull()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
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
        payload: { ...sonarrRule, monitor: 'movieOnly' },
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
        payload: { ...radarrRule, series_type: 'anime' },
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
        payload: { ...radarrRule, season_monitoring: 'all' },
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

    it('coerces a numeric quality_profile string to a number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, quality_profile: '3' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().rule.quality_profile).toBe(3)

      const knex = getTestDatabase()
      const row = await knex('router_rules')
        .where({ id: res.json().rule.id })
        .first()
      expect(row.quality_profile).toBe(3)
    })

    it('rejects a non-numeric quality_profile string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, quality_profile: 'abc' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain(
        'Quality profile must be a positive whole number.',
      )
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
        payload: radarrRule,
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.season_monitoring).toBeNull()
      expect(row.series_type).toBeNull()
    })

    it('clears quality profile, root folder, and tags on a type switch when not resupplied', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          quality_profile: 5,
          root_folder: '/data/shows',
          tags: ['10', '20'],
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: radarrRule,
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
      expect(JSON.parse(row.tags)).toEqual([])
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
        payload: sonarrRule,
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBeNull()
    })

    it('preserves new radarr fields when switching from sonarr', async () => {
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
        payload: { ...radarrRule, monitor: 'movieOnly' },
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.season_monitoring).toBeNull()
      expect(row.series_type).toBeNull()
      expect(row.monitor).toBe('movieOnly')
    })

    it('preserves new sonarr fields when switching from radarr', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, monitor: 'movieOnly' },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          ...sonarrRule,
          season_monitoring: 'all',
          series_type: 'anime',
        },
      })
      expect(putRes.statusCode).toBe(200)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.monitor).toBeNull()
      expect(row.season_monitoring).toBe('all')
      expect(row.series_type).toBe('anime')
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

  describe('exclude_from_routing', () => {
    it('clears instance-scoped fields when creating an exclude rule', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          exclude_from_routing: true,
          target_instance_id: null,
          quality_profile: 5,
          root_folder: '/data/shows',
          tags: ['10', '20'],
        },
      })
      expect(createRes.statusCode).toBe(201)
      expect(createRes.json().rule.exclude_from_routing).toBe(true)

      const knex = getTestDatabase()
      const row = await knex('router_rules')
        .where({ id: createRes.json().rule.id })
        .first()
      expect(row.target_instance_id).toBeNull()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
      expect(JSON.parse(row.tags)).toEqual([])
    })

    it('clears instance-scoped fields when a rule is switched to exclude', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          quality_profile: 5,
          root_folder: '/data/shows',
          tags: ['10', '20'],
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          ...sonarrRule,
          exclude_from_routing: true,
          target_instance_id: null,
          quality_profile: 5,
          root_folder: '/data/shows',
          tags: ['10', '20'],
        },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().rule.exclude_from_routing).toBe(true)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.target_instance_id).toBeNull()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
      expect(JSON.parse(row.tags)).toEqual([])
    })

    it('accepts the full client update payload when switching to exclude', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          quality_profile: 5,
          root_folder: '/data/shows',
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          name: sonarrRule.name,
          target_type: sonarrRule.target_type,
          condition: sonarrRule.condition,
          target_instance_id: null,
          tags: [],
          enabled: true,
          order: 50,
          always_require_approval: false,
          bypass_user_quotas: false,
          approval_reason: '',
          exclude_from_routing: true,
        },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().rule.exclude_from_routing).toBe(true)

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.target_instance_id).toBeNull()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
    })

    it('rejects an exclude update that keeps a target instance', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          ...sonarrRule,
          exclude_from_routing: true,
          target_instance_id: 1,
        },
      })
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain(
        'target_instance_id must be null when exclude_from_routing is true',
      )
    })

    it('rejects clearing exclude without supplying a target instance', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...sonarrRule,
          exclude_from_routing: true,
          target_instance_id: null,
        },
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          ...sonarrRule,
          exclude_from_routing: false,
          target_instance_id: null,
        },
      })
      expect(putRes.statusCode).toBe(400)
      expect(putRes.json().message).toContain(
        'target_instance_id is required unless exclude_from_routing is true',
      )
    })
  })

  describe('inherit on quality profile and root folder', () => {
    const pinned = {
      ...radarrRule,
      quality_profile: 5,
      root_folder: '/data/movies',
      tags: ['10'],
      search_on_add: false,
      monitor: 'movieAndCollection',
    }

    it.each(['quality_profile', 'root_folder'] as const)(
      'stores and returns a null %s as null',
      async (field) => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/content-router/rules',
          payload: { ...radarrRule, [field]: null },
        })
        expect(createRes.statusCode).toBe(201)
        const id = createRes.json().rule.id
        expect(createRes.json().rule[field]).toBeNull()

        const knex = getTestDatabase()
        const row = await knex('router_rules').where({ id }).first()
        expect(row[field]).toBeNull()

        const getRes = await app.inject({
          method: 'GET',
          url: `/v1/content-router/rules/${id}`,
        })
        expect(getRes.json().rule[field]).toBeNull()
      },
    )

    it('rejects an empty root_folder', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, root_folder: '' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain('Root folder cannot be empty.')
    })

    it('round-trips a pinned payload unchanged', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: pinned,
      })
      expect(createRes.statusCode).toBe(201)
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: pinned,
      })
      expect(putRes.statusCode).toBe(200)

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/content-router/rules/${id}`,
      })
      expect(getRes.json().rule).toMatchObject({
        quality_profile: 5,
        root_folder: '/data/movies',
        tags: ['10'],
        search_on_add: false,
        monitor: 'movieAndCollection',
      })
    })

    it('keeps inherit values sent on a PUT', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: pinned,
      })
      const id = createRes.json().rule.id

      const putRes = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${id}`,
        payload: {
          ...pinned,
          quality_profile: null,
          root_folder: null,
          search_on_add: null,
          monitor: null,
        },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().rule).toMatchObject({
        quality_profile: null,
        root_folder: null,
        search_on_add: null,
        monitor: null,
      })

      const knex = getTestDatabase()
      const row = await knex('router_rules').where({ id }).first()
      expect(row.quality_profile).toBeNull()
      expect(row.root_folder).toBeNull()
      expect(row.search_on_add).toBeNull()
      expect(row.monitor).toBeNull()
    })
  })

  describe('IMDb compound condition values', () => {
    const compound = { rating: 7, votes: 1000 }
    const votesOnly = { votes: 1000 }

    it('keeps rating and votes on a root-level condition', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...radarrRule,
          condition: {
            field: 'imdbRating',
            operator: 'greaterThan',
            value: compound,
          },
        },
      })
      expect(createRes.statusCode).toBe(201)
      expect(createRes.json().rule.condition.value).toEqual(compound)
    })

    it('keeps rating and votes on a direct child of the root group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...radarrRule,
          condition: {
            operator: 'AND',
            negate: false,
            conditions: [
              {
                field: 'imdbRating',
                operator: 'greaterThan',
                value: compound,
              },
              {
                field: 'imdbRating',
                operator: 'greaterThan',
                value: votesOnly,
              },
            ],
          },
        },
      })
      expect(createRes.statusCode).toBe(201)
      const [first, second] = createRes.json().rule.condition.conditions
      expect(first.value).toEqual(compound)
      expect(second.value).toEqual(votesOnly)
    })

    it.each([
      ['an array', 400, [1000, 2000]],
      ['a range', 400, { min: 1000 }],
      ['a number', 201, 1000],
    ])('answers votes as %s with %i', async (_label, status, votes) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...radarrRule,
          condition: {
            field: 'imdbRating',
            operator: 'greaterThan',
            value: { rating: 7, votes },
          },
        },
      })
      expect(res.statusCode).toBe(status)
    })
  })

  describe('criteria object values', () => {
    it.each([
      ['user', 'equals'],
      ['genres', 'contains'],
    ])('rejects an id and name object on %s', async (field, operator) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          ...radarrRule,
          condition: { field, operator, value: { id: 1, name: 'Action' } },
        },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('stored rules the request schema would reject', () => {
    const insertStoredRule = (overrides: Record<string, unknown>) =>
      getTestDatabase()('router_rules').insert({
        name: 'Stored Rule',
        type: 'conditional',
        target_type: 'sonarr',
        target_instance_id: 1,
        root_folder: '/data/shows',
        quality_profile: 1,
        tags: JSON.stringify([]),
        order: 50,
        enabled: true,
        ...overrides,
      })

    const storedCondition = (condition: Record<string, unknown>) =>
      JSON.stringify({
        condition: { operator: 'AND', negate: false, conditions: [condition] },
      })

    it('lists a rule whose regex fails the safety check', async () => {
      await insertStoredRule({
        criteria: storedCondition({
          field: 'title',
          operator: 'regex',
          value: '(a+)+$',
          negate: false,
        }),
      })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content-router/rules',
      })

      expect(res.statusCode).toBe(200)
      const [rule] = res.json().rules
      expect(rule.condition.conditions[0].value).toBe('(a+)+$')
    })

    it('lists a rule with an empty condition value and a NULL order', async () => {
      await insertStoredRule({
        order: null,
        criteria: storedCondition({
          field: 'imdbRating',
          operator: 'greaterThan',
          value: {},
          negate: false,
        }),
      })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content-router/rules',
      })

      expect(res.statusCode).toBe(200)
      const [rule] = res.json().rules
      expect(rule.order).toBeNull()
      expect(rule.condition.conditions[0].value).toEqual({})
    })

    it('lists a rule whose value is an id and name object', async () => {
      const value = { id: 1, name: 'admin' }
      await insertStoredRule({
        criteria: storedCondition({
          field: 'user',
          operator: 'equals',
          value,
          negate: false,
        }),
      })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content-router/rules',
      })

      expect(res.statusCode).toBe(200)
      const [rule] = res.json().rules
      expect(rule.condition.conditions[0].value).toEqual(value)
    })

    it('lists a rule whose compound votes is a range', async () => {
      const value = { rating: 7, votes: { min: 1000 } }
      await insertStoredRule({
        criteria: storedCondition({
          field: 'imdbRating',
          operator: 'greaterThan',
          value,
          negate: false,
        }),
      })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content-router/rules',
      })

      expect(res.statusCode).toBe(200)
      const [rule] = res.json().rules
      expect(rule.condition.conditions[0].value).toEqual(value)
    })

    it('lists a rule whose criteria is null', async () => {
      await insertStoredRule({ name: 'Null Criteria', criteria: 'null' })

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content-router/rules',
      })

      expect(res.statusCode).toBe(200)
      const [rule] = res.json().rules
      expect(rule.name).toBe('Null Criteria')
      expect(rule.condition).toBeUndefined()
    })
  })

  describe('nested condition groups', () => {
    const leaf = {
      field: 'genres',
      operator: 'contains',
      value: 'Action',
      negate: false,
    }

    const atDepthTwo = (group: Record<string, unknown>) => ({
      operator: 'AND',
      negate: false,
      conditions: [{ operator: 'AND', negate: false, conditions: [group] }],
    })

    const postRule = (condition: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, condition },
      })

    it('rejects an unknown operator at depth 2', async () => {
      const res = await postRule(
        atDepthTwo({ operator: 'XOR', negate: false, conditions: [leaf] }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('rejects more than 20 conditions at depth 2', async () => {
      const res = await postRule(
        atDepthTwo({
          operator: 'AND',
          negate: false,
          conditions: Array.from({ length: 21 }, () => leaf),
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('accepts a valid group at depth 3', async () => {
      const res = await postRule(
        atDepthTwo({
          operator: 'OR',
          negate: false,
          conditions: [
            { operator: 'AND', negate: false, conditions: [leaf, leaf] },
          ],
        }),
      )
      expect(res.statusCode).toBe(201)
    })
  })

  describe('condition field validation', () => {
    const postRule = (
      rule: typeof radarrRule | typeof sonarrRule,
      condition: Record<string, unknown>,
    ) =>
      app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...rule, condition },
      })

    it('rejects an unknown field', async () => {
      const res = await postRule(radarrRule, {
        field: 'genrez',
        operator: 'contains',
        value: 'Action',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain('Unknown condition field "genrez"')
    })

    it('rejects an operator the field does not list', async () => {
      const res = await postRule(radarrRule, {
        field: 'year',
        operator: 'regex',
        value: '^19',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain(
        'Operator "regex" is not supported for field "year"',
      )
    })

    it('rejects a field limited to the other instance type', async () => {
      const res = await postRule(sonarrRule, {
        operator: 'AND',
        negate: false,
        conditions: [
          { field: 'movieStatus', operator: 'equals', value: 'released' },
        ],
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain(
        'Field "movieStatus" is not supported for sonarr rules',
      )
    })

    it('rejects a bad operator on a leaf at depth 2', async () => {
      const res = await postRule(radarrRule, {
        operator: 'AND',
        negate: false,
        conditions: [
          {
            operator: 'OR',
            negate: false,
            conditions: [
              {
                operator: 'AND',
                negate: false,
                conditions: [
                  { field: 'genres', operator: 'between', value: 'Action' },
                ],
              },
            ],
          },
        ],
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toContain(
        'Operator "between" is not supported for field "genres"',
      )
    })

    it.each([
      ['an unknown field', { field: 'genrez', operator: 'contains' }],
      ['a disallowed operator', { field: 'year', operator: 'contains' }],
    ])(
      'lists and leaves unevaluated a stored rule with %s',
      async (_label, pair) => {
        const leaf = { ...pair, value: 'Action', negate: true }
        await getTestDatabase()('router_rules').insert({
          name: 'Stored Rule',
          type: 'conditional',
          target_type: 'radarr',
          target_instance_id: 1,
          tags: JSON.stringify([]),
          order: 50,
          enabled: true,
          criteria: JSON.stringify({ condition: leaf }),
        })

        const res = await app.inject({
          method: 'GET',
          url: '/v1/content-router/rules',
        })

        expect(res.statusCode).toBe(200)
        const [rule] = res.json().rules
        expect(rule.condition).toEqual(leaf)
        expect(
          app.contentRouter.evaluateCondition(
            rule.condition,
            {
              title: 'Movie',
              type: 'movie',
              guids: ['tmdb:1'],
              genres: ['Drama'],
            },
            { userId: 1, contentType: 'movie', itemKey: 'stored-rule-key' },
          ),
        ).toBe(false)
      },
    )
  })

  describe('order validation', () => {
    it('rejects a fractional order on create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...radarrRule, order: 50.5 },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects a fractional order on update', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: radarrRule,
      })
      const res = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${createRes.json().rule.id}`,
        payload: { ...radarrRule, order: 50.5 },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('target instance existence', () => {
    it('rejects a create that targets a missing instance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: { ...sonarrRule, target_instance_id: 999 },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe('Target instance does not exist')
    })

    it('rejects an update that targets a missing instance', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: radarrRule,
      })
      const res = await app.inject({
        method: 'PUT',
        url: `/v1/content-router/rules/${createRes.json().rule.id}`,
        payload: { ...radarrRule, target_instance_id: 999 },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe('Target instance does not exist')
    })
  })
})
