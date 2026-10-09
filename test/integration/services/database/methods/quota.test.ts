import type { QuotaWindowSettings } from '@utils/quota-window.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUserQuota } from '../../../../helpers/seeds/quotas.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'

const SETTINGS: QuotaWindowSettings = {
  weeklyRollingDays: 14,
  monthlyResetDay: 15,
  monthEnd: 'last-day',
}

const daysFromToday = (days: number) => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
}

const localDate = (date: Date) => date.toLocaleDateString('sv-SE')

const insertUsage = (userId: number, dates: Date[]) =>
  getTestDatabase()('quota_usage').insert(
    dates.map((date) => ({
      user_id: userId,
      content_type: 'movie',
      request_date: localDate(date),
      created_at: new Date().toISOString(),
    })),
  )

describe('quota database methods', () => {
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
    fastify.contentRouter.clearRouterRulesCache()
  })

  describe('weekly_rolling', () => {
    beforeEach(async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_type: 'weekly_rolling',
        quota_limit: 5,
      })
    })

    it('counts the configured window and resets when the earliest request ages out', async () => {
      await insertUsage(1, [
        daysFromToday(-14),
        daysFromToday(-10),
        daysFromToday(0),
      ])

      const status = await fastify.db.getQuotaStatus(1, 'movie', SETTINGS)

      expect(status?.currentUsage).toBe(2)
      expect(status?.resetDate).toBe(daysFromToday(4).toISOString())
    })

    it('has no reset date without usage in the window', async () => {
      await insertUsage(1, [daysFromToday(-14)])

      const status = await fastify.db.getQuotaStatus(1, 'movie', SETTINGS)

      expect(status?.currentUsage).toBe(0)
      expect(status?.resetDate).toBeNull()
    })

    it('returns the same per-user reset date from the bulk path', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 2,
        content_type: 'movie',
        quota_type: 'weekly_rolling',
        quota_limit: 5,
      })
      await insertUsage(1, [daysFromToday(-10), daysFromToday(-1)])
      await insertUsage(2, [daysFromToday(-3)])

      const bulk = await fastify.db.getBulkQuotaStatus(
        [1, 2],
        SETTINGS,
        'movie',
      )
      const single1 = await fastify.db.getQuotaStatus(1, 'movie', SETTINGS)
      const single2 = await fastify.db.getQuotaStatus(2, 'movie', SETTINGS)

      expect(bulk).toEqual([
        { userId: 1, quotaStatus: single1 },
        { userId: 2, quotaStatus: single2 },
      ])
      expect(single1?.resetDate).toBe(daysFromToday(4).toISOString())
      expect(single2?.resetDate).toBe(daysFromToday(11).toISOString())
    })
  })

  describe('monthly', () => {
    it('counts from the configured reset day and reports the next one', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_type: 'monthly',
        quota_limit: 5,
      })
      const today = daysFromToday(0)
      const thisMonthReset = new Date(today.getFullYear(), today.getMonth(), 15)
      const onOrAfterReset = today >= thisMonthReset
      const start = onOrAfterReset
        ? thisMonthReset
        : new Date(today.getFullYear(), today.getMonth() - 1, 15)
      const nextReset = onOrAfterReset
        ? new Date(today.getFullYear(), today.getMonth() + 1, 15)
        : thisMonthReset
      const dayBeforeStart = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() - 1,
      )
      await insertUsage(1, [dayBeforeStart, start, today])

      const status = await fastify.db.getQuotaStatus(1, 'movie', SETTINGS)

      expect(status?.currentUsage).toBe(2)
      expect(status?.resetDate).toBe(nextReset.toISOString())
    })
  })
})
