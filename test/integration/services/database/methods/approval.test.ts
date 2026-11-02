import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedSystemUser, seedUsers } from '../../../../helpers/seeds/users.js'

const approvalRow = (id: number, expiresAt: string | null) => ({
  id,
  user_id: 1,
  content_type: 'movie',
  content_title: `Title ${id}`,
  content_key: `key-${id}`,
  content_guids: JSON.stringify([`tmdb:${id}`]),
  router_decision: JSON.stringify({ action: 'continue' }),
  triggered_by: 'quota_exceeded',
  status: 'pending',
  expires_at: expiresAt,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

describe('approval database methods', () => {
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
    await seedUsers(knex)
    await seedSystemUser(knex)
    fastify.caches.clear()
  })

  describe('getApprovalHistory ordering', () => {
    beforeEach(async () => {
      await getTestDatabase()('approval_requests').insert([
        approvalRow(1, null),
        approvalRow(2, '2026-03-01T00:00:00.000Z'),
        approvalRow(3, null),
        approvalRow(4, '2026-02-01T00:00:00.000Z'),
      ])
    })

    const historyIds = async (
      sortBy: 'expiresAt' | 'status',
      sortOrder: 'asc' | 'desc',
    ) => {
      const rows = await fastify.db.getApprovalHistory(
        undefined,
        undefined,
        50,
        0,
        undefined,
        undefined,
        undefined,
        sortBy,
        sortOrder,
      )
      return rows.map((row) => row.id)
    }

    it('puts requests without an expiry last in both directions', async () => {
      expect(await historyIds('expiresAt', 'asc')).toEqual([4, 2, 1, 3])
      expect(await historyIds('expiresAt', 'desc')).toEqual([2, 4, 3, 1])
    })

    it('breaks ties on the sort column by id in the sort direction', async () => {
      expect(await historyIds('status', 'asc')).toEqual([1, 2, 3, 4])
      expect(await historyIds('status', 'desc')).toEqual([4, 3, 2, 1])
    })
  })
})
