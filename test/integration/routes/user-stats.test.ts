import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const USER_ID = 2

describe('GET /v1/users/:id/stats', () => {
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
    const knex = getTestDatabase()
    await seedAll(knex)
    app.config.authenticationMethod = 'disabled'

    await knex('watchlist_items').insert(
      [
        { key: 'stats-pending-1', status: 'pending' },
        { key: 'stats-pending-2', status: 'pending' },
        { key: 'stats-requested', status: 'requested' },
        { key: 'stats-notified', status: 'notified' },
      ].map(({ key, status }) => ({
        user_id: USER_ID,
        title: key,
        key,
        type: 'movie',
        guids: JSON.stringify([]),
        genres: JSON.stringify([]),
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    )

    await knex('notifications').insert(
      ['First', 'Second'].map((title) => ({
        user_id: USER_ID,
        type: 'movie',
        title,
      })),
    )

    await knex('approval_requests').insert(
      ['pending', 'approved'].map((status) => ({
        user_id: USER_ID,
        content_type: 'movie',
        content_title: `Approval ${status}`,
        content_key: `approval-${status}`,
        content_guids: JSON.stringify([]),
        router_decision: JSON.stringify({ action: 'require_approval' }),
        triggered_by: 'router_rule',
        status,
      })),
    )
  })

  it('returns the exact counts for the user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/users/${USER_ID}/stats`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      stats: {
        watchlist: {
          pending: 2,
          requested: 1,
          grabbed: 0,
          notified: 1,
          total: 4,
        },
        notificationsSent: 2,
        pendingApprovals: 1,
      },
    })
  })

  it('returns 404 for an unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/9999/stats' })

    expect(res.statusCode).toBe(404)
  })
})
