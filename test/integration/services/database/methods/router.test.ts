import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'

describe('router database methods', () => {
  let fastify: FastifyInstance

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
    await seedInstances(knex)
    fastify.contentRouter.clearRouterRulesCache()
  })

  describe('getAllRouterRules', () => {
    it('treats a NULL enabled rule as disabled', async () => {
      await getTestDatabase()('router_rules').insert({
        name: 'Rule',
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: 1,
        criteria: JSON.stringify({
          condition: { operator: 'AND', negate: false, conditions: [] },
        }),
        tags: JSON.stringify([]),
        order: 50,
        enabled: null,
      })
      const [rule] = await fastify.db.getAllRouterRules()
      expect(rule.enabled).toBe(false)
    })
    it('falls back to an empty AND group for invalid criteria JSON', async () => {
      await getTestDatabase()('router_rules').insert({
        name: 'Rule',
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: 1,
        criteria: '{not json',
        tags: JSON.stringify([]),
        order: 50,
        enabled: true,
      })
      const [rule] = await fastify.db.getAllRouterRules()
      expect(rule.criteria).toEqual({
        condition: { operator: 'AND', conditions: [] },
      })
    })

    it('falls back to no tags for invalid tags JSON', async () => {
      await getTestDatabase()('router_rules').insert({
        name: 'Rule',
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: 1,
        criteria: JSON.stringify({
          condition: { operator: 'AND', negate: false, conditions: [] },
        }),
        tags: '{not json',
        order: 50,
        enabled: true,
      })
      const [rule] = await fastify.db.getAllRouterRules()
      expect(rule.tags).toEqual([])
    })
  })
})
