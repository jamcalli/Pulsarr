import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import {
  SEED_RADARR_INSTANCES,
  SEED_WATCHLIST_ITEMS,
  seedAll,
} from '../../helpers/seeds/index.js'

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

  it('GET /v1/stats/recent-requests returns the highest junction status as the request status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?limit=50',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{
      id: number
      status: string
      allInstances: Array<{ junctionStatus: string }>
      primaryInstance: { junctionStatus: string } | null
    }> = res.json().items
    const byId = (id: number) => items.find((item) => item.id === id)

    expect(
      [1, 2, 3].map((id) => ({
        status: byId(id)?.status,
        junctionStatus: byId(id)?.allInstances[0]?.junctionStatus,
        primaryJunctionStatus: byId(id)?.primaryInstance?.junctionStatus,
      })),
    ).toEqual([
      {
        status: 'requested',
        junctionStatus: 'requested',
        primaryJunctionStatus: 'requested',
      },
      {
        status: 'grabbed',
        junctionStatus: 'grabbed',
        primaryJunctionStatus: 'grabbed',
      },
      {
        status: 'notified',
        junctionStatus: 'notified',
        primaryJunctionStatus: 'notified',
      },
    ])
  })

  it('GET /v1/stats/recent-requests filters on a raw status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?status=grabbed',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{ id: number }> = res.json().items
    expect(items.map((item) => item.id)).toEqual([2])
  })

  it('GET /v1/stats/recent-requests returns when each status was first reached', async () => {
    const times = {
      requested: '2025-06-01T10:00:00.000Z',
      grabbed: '2025-06-02T11:00:00.000Z',
      notified: '2025-06-03T12:00:00.000Z',
    }
    await getTestDatabase()('watchlist_status_history').insert(
      Object.entries(times).map(([status, timestamp]) => ({
        watchlist_item_id: 3,
        status,
        timestamp,
      })),
    )

    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?limit=50',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{
      id: number
      statusTimes: Record<keyof typeof times, string | null>
    }> = res.json().items
    const statusTimes = (id: number) =>
      items.find((item) => item.id === id)?.statusTimes
    const asIso = (value: string | null | undefined) =>
      value ? new Date(value).toISOString() : value

    const notified = statusTimes(3)
    expect({
      requested: asIso(notified?.requested),
      grabbed: asIso(notified?.grabbed),
      notified: asIso(notified?.notified),
    }).toEqual(times)
    expect(statusTimes(1)).toEqual({
      requested: null,
      grabbed: null,
      notified: null,
    })
  })

  it('GET /v1/users/:userId/watchlist returns routed and unrouted rows of that user', async () => {
    const [owned, other] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/users/1/watchlist' }),
      app.inject({ method: 'GET', url: '/v1/users/2/watchlist' }),
    ])

    expect(owned.statusCode).toBe(200)
    const data: {
      user: { id: number; name: string }
      items: Array<{
        id: number
        key: string
        status: string
        allInstances: Array<{ id: number }>
      }>
      total: number
    } = owned.json().data
    const routedStatuses = ['requested', 'grabbed', 'notified']
    expect(data.user.id).toBe(1)
    expect(data.total).toBe(SEED_WATCHLIST_ITEMS.length)
    expect(
      data.items
        .map(({ id, key, status, allInstances }) => ({
          id,
          key,
          status,
          instanceCount: allInstances.length,
        }))
        .sort((a, b) => a.id - b.id),
    ).toEqual(
      SEED_WATCHLIST_ITEMS.map((item, index) => ({
        id: item.id,
        key: item.key,
        status: routedStatuses[index] ?? 'pending',
        instanceCount: index < routedStatuses.length ? 1 : 0,
      })),
    )

    expect(other.statusCode).toBe(200)
    expect(other.json().data.items).toEqual([])
  })

  const insertWatchlistItem = async (
    userId: number,
    key: string,
    createdAt = '2025-06-01T00:00:00Z',
  ) => {
    const [row] = await getTestDatabase()('watchlist_items')
      .insert({
        user_id: userId,
        title: key,
        key,
        type: 'movie',
        thumb: null,
        added: createdAt,
        guids: JSON.stringify([]),
        genres: JSON.stringify([]),
        status: 'pending',
        created_at: createdAt,
        updated_at: createdAt,
      })
      .returning('id')
    return row.id
  }

  it('GET /v1/users/:userId/watchlist includes unrouted items that the dashboard leaves out', async () => {
    const unroutedId = await insertWatchlistItem(2, 'unrouted-item')
    const routedId = await insertWatchlistItem(2, 'routed-item')
    await getTestDatabase()('watchlist_radarr_instances').insert({
      watchlist_id: routedId,
      radarr_instance_id: 1,
      status: 'requested',
      is_primary: true,
      syncing: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const [userRes, dashboardRes] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/users/2/watchlist' }),
      app.inject({ method: 'GET', url: '/v1/stats/recent-requests?limit=50' }),
    ])

    expect(userRes.statusCode).toBe(200)
    const userItems: Array<{
      id: number
      status: string
      primaryInstance: { id: number } | null
      allInstances: Array<{ id: number }>
    }> = userRes.json().data.items
    expect(userItems).toHaveLength(2)
    expect(userItems.find((item) => item.id === unroutedId)).toMatchObject({
      status: 'pending',
      primaryInstance: null,
      allInstances: [],
    })
    expect(userItems.find((item) => item.id === routedId)?.status).toBe(
      'requested',
    )

    expect(dashboardRes.statusCode).toBe(200)
    const dashboardIds = (
      dashboardRes.json().items as Array<{ id: number; userId: number }>
    )
      .filter((item) => item.userId === 2)
      .map((item) => item.id)
    expect(dashboardIds).toEqual([routedId])
  })

  it('GET /v1/stats/recent-requests limits by item, not by instance row', async () => {
    const knex = getTestDatabase()
    const { id: _seedId, ...radarrInstance } = SEED_RADARR_INSTANCES[0]
    const extraInstanceIds = await knex('radarr_instances')
      .insert(
        ['Second Radarr', 'Third Radarr', 'Fourth Radarr'].map(
          (name, index) => ({
            ...radarrInstance,
            name,
            base_url: `http://test-radarr-${index + 2}:7878`,
            is_default: false,
          }),
        ),
      )
      .returning('id')
    const instanceIds = [1, ...extraInstanceIds.map((row) => row.id)]

    const olderId = await insertWatchlistItem(
      2,
      'older',
      '2030-01-01T00:00:00Z',
    )
    const newestIds = [
      await insertWatchlistItem(2, 'newest-1', '2030-01-02T00:00:00Z'),
      await insertWatchlistItem(2, 'newest-2', '2030-01-03T00:00:00Z'),
      await insertWatchlistItem(2, 'newest-3', '2030-01-04T00:00:00Z'),
    ]
    const junctionRow = (watchlistId: number, instanceId: number) => ({
      watchlist_id: watchlistId,
      radarr_instance_id: instanceId,
      status: 'requested',
      is_primary: instanceId === 1,
      syncing: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await knex('watchlist_radarr_instances').insert([
      junctionRow(olderId, 1),
      ...newestIds.flatMap((id) =>
        instanceIds.map((instanceId) => junctionRow(id, instanceId)),
      ),
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/recent-requests?limit=3',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{ id: number; allInstances: Array<{ id: number }> }> =
      res.json().items
    expect(
      items
        .map(({ id, allInstances }) => ({
          id,
          instanceIds: allInstances
            .map((instance) => instance.id)
            .sort((a, b) => a - b),
        }))
        .sort((a, b) => a.id - b.id),
    ).toEqual(newestIds.map((id) => ({ id, instanceIds })))
    expect(items.some((item) => item.id === olderId)).toBe(false)
  })

  it('GET /v1/users/:userId/watchlist shows an item awaiting approval once', async () => {
    await insertWatchlistItem(2, 'awaiting-approval')
    await getTestDatabase()('approval_requests').insert({
      user_id: 2,
      content_type: 'movie',
      content_title: 'awaiting-approval',
      content_key: 'awaiting-approval',
      content_guids: JSON.stringify([]),
      router_decision: JSON.stringify({ action: 'require_approval' }),
      triggered_by: 'router_rule',
      status: 'pending',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/2/watchlist',
    })

    expect(res.statusCode).toBe(200)
    const items: Array<{ key: string; source: string; status: string }> =
      res.json().data.items
    expect(
      items.map(({ key, source, status }) => ({ key, source, status })),
    ).toEqual([
      {
        key: 'awaiting-approval',
        source: 'approval',
        status: 'pending_approval',
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
