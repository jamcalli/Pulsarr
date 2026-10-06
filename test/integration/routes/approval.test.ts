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

    await knex('watchlist_items').insert({
      user_id: 2,
      title: watchlistItem.title,
      key: watchlistItem.key,
      type: watchlistItem.type,
      thumb: 'https://example.com/other-user-poster.jpg',
      guids: watchlistItem.guids,
      genres: watchlistItem.genres,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

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
  })

  it('GET /v1/approval/requests returns the requester watchlist thumb without duplicating rows', async () => {
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

  it('GET /v1/approval/requests/:id returns the thumb', async () => {
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
})
