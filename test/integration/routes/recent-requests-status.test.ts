import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { SEED_WATCHLIST_ITEMS, seedAll } from '../../helpers/seeds/index.js'

describe('recent requests junction status', () => {
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

    await knex('watchlist_radarr_instances').insert(
      [
        { watchlistId: 1, status: 'requested' },
        { watchlistId: 2, status: 'grabbed' },
        { watchlistId: 3, status: 'notified' },
      ].map(({ watchlistId, status }) => ({
        watchlist_id: watchlistId,
        radarr_instance_id: 1,
        status,
        is_primary: true,
        syncing: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    )
  })

  it('GET /v1/stats/recent-requests returns the raw junction status beside the collapsed one', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?limit=50',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{
      id: number
      status: string
      allInstances: Array<{ status: string; junctionStatus: string }>
      primaryInstance: { junctionStatus: string } | null
    }> = res.json().items
    const byId = (id: number) => items.find((item) => item.id === id)

    expect(
      [1, 2, 3].map((id) => ({
        status: byId(id)?.status,
        instanceStatus: byId(id)?.allInstances[0]?.status,
        junctionStatus: byId(id)?.allInstances[0]?.junctionStatus,
        primaryJunctionStatus: byId(id)?.primaryInstance?.junctionStatus,
      })),
    ).toEqual([
      {
        status: 'requested',
        instanceStatus: 'requested',
        junctionStatus: 'requested',
        primaryJunctionStatus: 'requested',
      },
      {
        status: 'available',
        instanceStatus: 'available',
        junctionStatus: 'grabbed',
        primaryJunctionStatus: 'grabbed',
      },
      {
        status: 'available',
        instanceStatus: 'available',
        junctionStatus: 'notified',
        primaryJunctionStatus: 'notified',
      },
    ])
  })

  it('GET /v1/stats/recent-requests returns the watchlist thumb for a pending approval', async () => {
    const watchlistItem = SEED_WATCHLIST_ITEMS[0]
    const approvalBase = {
      user_id: watchlistItem.user_id,
      content_type: 'movie',
      content_guids: watchlistItem.guids,
      router_decision: JSON.stringify({ action: 'require_approval' }),
      triggered_by: 'router_rule',
      status: 'pending',
    }
    const [matched] = await getTestDatabase()('approval_requests')
      .insert({
        ...approvalBase,
        content_title: watchlistItem.title,
        content_key: watchlistItem.key,
      })
      .returning('id')
    const [unmatched] = await getTestDatabase()('approval_requests')
      .insert({
        ...approvalBase,
        content_title: 'Not On Any Watchlist',
        content_key: 'no-watchlist-row',
      })
      .returning('id')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?status=pending_approval',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{ id: number; thumb: string | null }> = res.json().items
    expect(items).toHaveLength(2)
    expect(items.find((item) => item.id === matched.id)?.thumb).toBe(
      watchlistItem.thumb,
    )
    expect(items.find((item) => item.id === unmatched.id)?.thumb).toBeNull()
  })
})
