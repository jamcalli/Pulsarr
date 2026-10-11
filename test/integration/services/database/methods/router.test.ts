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

  describe('hasAnyRouterRules', () => {
    const insertRule = (enabled: boolean | null) =>
      getTestDatabase()('router_rules').insert({
        name: 'Rule',
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: 1,
        criteria: JSON.stringify({
          condition: { operator: 'AND', negate: false, conditions: [] },
        }),
        tags: JSON.stringify([]),
        order: 50,
        enabled,
      })

    it('counts an enabled rule', async () => {
      await insertRule(true)
      expect(await fastify.db.hasAnyRouterRules()).toBe(true)
    })

    it('treats a NULL enabled rule as disabled, like the rule formatter', async () => {
      await insertRule(null)
      expect(await fastify.db.hasAnyRouterRules()).toBe(false)
      const [rule] = await fastify.db.getAllRouterRules()
      expect(rule.enabled).toBe(false)
    })
  })
})
