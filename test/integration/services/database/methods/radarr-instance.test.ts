import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'

describe('radarr instance database methods', () => {
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

  describe('minimumAvailability', () => {
    it('returns a mixed-case stored value in canonical case', async () => {
      await getTestDatabase()('radarr_instances')
        .where({ id: 1 })
        .update({ minimum_availability: 'INCINEMAS' })
      const instance = await fastify.db.getRadarrInstance(1)
      expect(instance?.minimumAvailability).toBe('inCinemas')
    })

    it('rejects an invalid stored value', async () => {
      await getTestDatabase()('radarr_instances')
        .where({ id: 1 })
        .update({ minimum_availability: 'someday' })
      await expect(fastify.db.getRadarrInstance(1)).rejects.toThrow(
        'Invalid minimumAvailability value: someday',
      )
    })
  })
})
