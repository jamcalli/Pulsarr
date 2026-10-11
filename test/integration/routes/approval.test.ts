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
import { SEED_WATCHLIST_ITEMS, seedAll } from '../../helpers/seeds/index.js'
import { appliedRadarr } from '../../mocks/applied-routing.js'

describe('approval requests thumb', () => {
  let app: FastifyInstance
  const watchlistItem = SEED_WATCHLIST_ITEMS[0]
  let matchedId: number
  let unmatchedId: number

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
    app.contentRouter.clearRouterRulesCache()

    const approvalBase = {
      user_id: watchlistItem.user_id,
      content_type: 'movie',
      content_guids: watchlistItem.guids,
      router_decision: JSON.stringify({ action: 'require_approval' }),
      triggered_by: 'router_rule',
      status: 'pending',
    }
    const [matched] = await knex('approval_requests')
      .insert({
        ...approvalBase,
        content_title: watchlistItem.title,
        content_key: watchlistItem.key,
        thumb: watchlistItem.thumb,
      })
      .returning('id')
    const [unmatched] = await knex('approval_requests')
      .insert({
        ...approvalBase,
        content_title: 'Not On Any Watchlist',
        content_key: 'no-watchlist-row',
      })
      .returning('id')
    matchedId = matched.id
    unmatchedId = unmatched.id

    await knex('watchlist_items').where('key', watchlistItem.key).del()
  })

  it('routing an item that needs approval stores its thumb on the request', async () => {
    const thumb = '/drama-poster.jpg'
    const result = await app.contentRouter.routeContent(
      {
        title: 'Thumb Drama',
        type: 'movie',
        guids: ['imdb:tt7777777', 'tmdb:77777'],
        genres: ['Drama'],
        thumb,
      },
      'thumb-drama-key',
      { userId: 1, userName: 'test-user-primary' },
    )

    expect(result.routedInstances).toEqual([])
    const row = await getTestDatabase()('approval_requests')
      .where('content_key', 'thumb-drama-key')
      .first()
    expect(row?.status).toBe('pending')
    expect(row?.thumb).toBe(thumb)
  })

  it('GET /v1/approval/requests returns the stored thumb after the watchlist row is gone', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/approval/requests',
    })

    expect(res.statusCode).toBe(200)
    const body: {
      total: number
      approvalRequests: Array<{ id: number; thumb: string | null }>
    } = res.json()
    expect(body.total).toBe(2)
    expect(body.approvalRequests).toHaveLength(2)
    expect(
      body.approvalRequests.find((request) => request.id === matchedId)?.thumb,
    ).toBe(watchlistItem.thumb)
    expect(
      body.approvalRequests.find((request) => request.id === unmatchedId)
        ?.thumb,
    ).toBeNull()
  })

  it('GET /v1/approval/requests/:id returns the stored thumb', async () => {
    const matchedRes = await app.inject({
      method: 'GET',
      url: `/v1/approval/requests/${matchedId}`,
    })
    const unmatchedRes = await app.inject({
      method: 'GET',
      url: `/v1/approval/requests/${unmatchedId}`,
    })

    expect(matchedRes.statusCode).toBe(200)
    expect(matchedRes.json().approvalRequest.thumb).toBe(watchlistItem.thumb)
    expect(unmatchedRes.statusCode).toBe(200)
    expect(unmatchedRes.json().approvalRequest.thumb).toBeNull()
  })

  describe('approve without routing', () => {
    beforeEach(() => {
      vi.spyOn(app.radarrManager, 'checkInstancesHealth').mockResolvedValue({
        available: [],
        unavailable: [],
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('POST /v1/approval/requests/:id/approve returns 409 and keeps the request pending', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/approval/requests/${matchedId}/approve`,
        payload: {},
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().message).toBe('Set routing before approving.')

      const after = await app.inject({
        method: 'GET',
        url: `/v1/approval/requests/${matchedId}`,
      })
      expect(after.json().approvalRequest.status).toBe('pending')
      expect(after.json().approvalRequest.approvedBy).toBeNull()
    })

    it('PATCH /v1/approval/requests/:id approving without routing returns 409', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/approval/requests/${matchedId}`,
        payload: { status: 'approved' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().message).toBe('Set routing before approving.')
    })
  })

  describe('status transitions', () => {
    const routedDecision = JSON.stringify({
      action: 'route',
      routing: { instanceId: 1, instanceType: 'radarr', priority: 1 },
    })

    const insertRouted = async (
      contentKey: string,
      row: {
        status: string
        approved_by?: number
        approval_notes?: string
      },
    ): Promise<number> => {
      const [inserted] = await getTestDatabase()('approval_requests')
        .insert({
          user_id: watchlistItem.user_id,
          content_type: 'movie',
          content_title: contentKey,
          content_key: contentKey,
          content_guids: watchlistItem.guids,
          router_decision: routedDecision,
          triggered_by: 'router_rule',
          ...row,
        })
        .returning('id')
      return inserted.id
    }

    const getRow = async (id: number) => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/approval/requests/${id}`,
      })
      return res.json().approvalRequest
    }

    beforeEach(() => {
      vi.spyOn(app.radarrManager, 'checkInstancesHealth').mockResolvedValue({
        available: [],
        unavailable: [],
      })
      vi.spyOn(app.sonarrManager, 'checkInstancesHealth').mockResolvedValue({
        available: [],
        unavailable: [],
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('bulk approve fails an expired request and approves a pending one', async () => {
      vi.spyOn(app.radarrManager, 'routeItemToRadarr').mockResolvedValue(
        appliedRadarr(),
      )
      const expiredId = await insertRouted('expired-item', {
        status: 'expired',
      })
      const pendingId = await insertRouted('pending-item', {
        status: 'pending',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/approval/requests/bulk/approve',
        payload: { requestIds: [expiredId, pendingId] },
      })

      expect(res.statusCode).toBe(200)
      const { result } = res.json()
      expect(result.successful).toBe(1)
      expect(result.failed).toEqual([expiredId])
      expect(result.errors).toEqual([
        `Request ${expiredId}: Cannot approve request that is already expired`,
      ])
      expect((await getRow(expiredId)).status).toBe('expired')
      expect((await getRow(expiredId)).approvedBy).toBeNull()
      expect((await getRow(pendingId)).status).toBe('approved')
    })

    it('bulk reject fails an approved request and leaves it unchanged', async () => {
      const approvedId = await insertRouted('approved-item', {
        status: 'approved',
        approved_by: 1,
        approval_notes: 'looks good',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/approval/requests/bulk/reject',
        payload: { requestIds: [approvedId], reason: 'nope' },
      })

      expect(res.statusCode).toBe(200)
      const { result } = res.json()
      expect(result.successful).toBe(0)
      expect(result.failed).toEqual([approvedId])
      expect(result.errors).toEqual([
        `Request ${approvedId}: Cannot reject request that is already approved`,
      ])
      const row = await getRow(approvedId)
      expect(row.status).toBe('approved')
      expect(row.approvedBy).toBe(1)
      expect(row.approvalNotes).toBe('looks good')
    })

    it('re-approving a rejected request whose routing fails keeps the denial', async () => {
      vi.spyOn(app.radarrManager, 'routeItemToRadarr').mockRejectedValue(
        new Error('radarr down'),
      )
      await getTestDatabase()('admin_users').insert({
        id: 2,
        username: 'second-admin',
        password: 'unused',
        email: 'second-admin@example.com',
        role: 'admin',
      })
      const rejectedId = await insertRouted('rejected-item', {
        status: 'rejected',
        approved_by: 2,
        approval_notes: 'not this one',
      })

      const res = await app.inject({
        method: 'POST',
        url: `/v1/approval/requests/${rejectedId}/approve`,
        payload: { notes: 'changed my mind' },
      })

      expect(res.statusCode).toBe(409)
      const row = await getRow(rejectedId)
      expect(row.status).toBe('rejected')
      expect(row.approvedBy).toBe(2)
      expect(row.approvalNotes).toBe('not this one')
    })

    it('approving a pending request whose routing fails rolls back to pending', async () => {
      vi.spyOn(app.radarrManager, 'routeItemToRadarr').mockRejectedValue(
        new Error('radarr down'),
      )
      const pendingId = await insertRouted('pending-item', {
        status: 'pending',
      })

      const res = await app.inject({
        method: 'POST',
        url: `/v1/approval/requests/${pendingId}/approve`,
        payload: { notes: 'ship it' },
      })

      expect(res.statusCode).toBe(409)
      const row = await getRow(pendingId)
      expect(row.status).toBe('pending')
      expect(row.approvedBy).toBeNull()
      expect(row.approvalNotes).toBeNull()
    })

    it('PATCH routing on an approved request returns 409', async () => {
      const approvedId = await insertRouted('approved-item', {
        status: 'approved',
        approved_by: 1,
      })

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/approval/requests/${approvedId}`,
        payload: { approvalNotes: 'edit' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().message).toBe(
        'Cannot modify routing for approved approval requests',
      )
    })
  })
})
