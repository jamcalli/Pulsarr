import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll, seedUserQuota } from '../../helpers/seeds/index.js'

describe('QuotaService.updateUserQuotas', () => {
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
    await seedUserQuota(getTestDatabase(), {
      user_id: 1,
      content_type: 'movie',
      quota_limit: 1,
    })
    await seedUserQuota(getTestDatabase(), {
      user_id: 1,
      content_type: 'show',
      quota_limit: 1,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates both content types', async () => {
    const result = await app.quotaService.updateUserQuotas(1, {
      quotaLimit: 7,
    })

    expect(result?.movieQuota?.quotaLimit).toBe(7)
    expect(result?.showQuota?.quotaLimit).toBe(7)
  })

  it('rolls back the movie write when the show write fails', async () => {
    const knex = getTestDatabase()
    await knex.raw(`CREATE TRIGGER fail_show_quota BEFORE UPDATE ON user_quotas
      WHEN NEW.content_type = 'show'
      BEGIN SELECT RAISE(ABORT, 'show quota write failed'); END`)
    try {
      await expect(
        app.quotaService.updateUserQuotas(1, { quotaLimit: 9 }),
      ).rejects.toThrow('show quota write failed')
    } finally {
      await knex.raw('DROP TRIGGER fail_show_quota')
    }

    const rows = await knex('user_quotas')
      .where({ user_id: 1 })
      .orderBy('content_type')
    expect(rows.map((row) => [row.content_type, row.quota_limit])).toEqual([
      ['movie', 1],
      ['show', 1],
    ])
  })
})
