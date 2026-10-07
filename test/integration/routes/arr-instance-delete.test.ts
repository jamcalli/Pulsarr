import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedConfig } from '../../helpers/seeds/config.js'
import { seedInstances } from '../../helpers/seeds/instances.js'

describe('Arr instance delete', () => {
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

  const createRule = async (targetType: 'radarr' | 'sonarr') => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/content-router/rules',
      payload: {
        name: `${targetType} rule`,
        target_type: targetType,
        target_instance_id: 1,
        condition: { operator: 'AND', conditions: [], negate: false },
      },
    })
    expect(res.statusCode).toBe(201)
    return res.json().rule.id as number
  }

  it.each(['radarr', 'sonarr'] as const)(
    'drops the deleted %s instance rules from the router rules cache',
    async (targetType) => {
      const ruleId = await createRule(targetType)
      const warm = await app.contentRouter.getAllRouterRules()
      expect(warm.map((rule) => rule.id)).toContain(ruleId)

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/${targetType}/instances/1`,
      })
      expect(res.statusCode).toBe(204)

      const rules = await app.contentRouter.getAllRouterRules()
      expect(rules.map((rule) => rule.id)).not.toContain(ruleId)
    },
  )
})
