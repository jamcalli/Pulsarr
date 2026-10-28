import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'

describe('sonarr instance database methods', () => {
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

  describe('monitorNewItems', () => {
    it('stores a mixed-case value in canonical case', async () => {
      const value: string = 'NONE'
      await fastify.db.updateSonarrInstance(1, {
        monitorNewItems: value as SonarrInstance['monitorNewItems'],
      })
      const instance = await fastify.db.getSonarrInstance(1)
      expect(instance?.monitorNewItems).toBe('none')
    })

    it('rejects an invalid value', async () => {
      const value: string = 'sometimes'
      await expect(
        fastify.db.updateSonarrInstance(1, {
          monitorNewItems: value as SonarrInstance['monitorNewItems'],
        }),
      ).rejects.toThrow('Invalid monitorNewItems value: sometimes')
      const instance = await fastify.db.getSonarrInstance(1)
      expect(instance?.monitorNewItems).toBe('all')
    })
  })
})
