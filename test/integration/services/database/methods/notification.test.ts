import type { NotificationType } from '@root/types/notification.types.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'
import { seedWatchlist } from '../../../../helpers/seeds/watchlist.js'

describe('createNotificationRecord', () => {
  let fastify: FastifyInstance
  let itemId: number

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
    await seedWatchlist(knex)
    const item = await knex('watchlist_items').where({ user_id: 1 }).first()
    itemId = item.id
    fastify.caches.clear()
  })

  const record = (
    type: NotificationType,
    overrides: {
      user_id?: number | null
      watchlist_item_id?: number | null
      season_number?: number
      episode_number?: number
    } = {},
  ) =>
    fastify.db.createNotificationRecord({
      watchlist_item_id: itemId,
      user_id: 1,
      type,
      title: 'Some Title',
      sent_to_discord: false,
      sent_to_apprise: false,
      ...overrides,
    })

  it.each([
    ['movie', {}],
    ['season', { season_number: 2 }],
    ['episode', { season_number: 2, episode_number: 5 }],
    ['public movie', { user_id: null, watchlist_item_id: null }],
  ] as const)('ignores a repeat %s claim', async (label, overrides) => {
    const type: NotificationType = label === 'public movie' ? 'movie' : label

    expect(await record(type, overrides)).toEqual(expect.any(Number))
    expect(await record(type, overrides)).toBeNull()
  })

  it('keeps separate claims for different episodes of a season', async () => {
    expect(
      await record('episode', { season_number: 2, episode_number: 5 }),
    ).toEqual(expect.any(Number))
    expect(
      await record('episode', { season_number: 2, episode_number: 6 }),
    ).toEqual(expect.any(Number))
  })

  it.each([
    ['approval_resolved', { watchlist_item_id: null }],
    ['watchlist_cap', {}],
  ] as const)('records every repeat %s event', async (type, overrides) => {
    const first = await record(type, overrides)
    const second = await record(type, overrides)

    expect(first).toEqual(expect.any(Number))
    expect(second).toEqual(expect.any(Number))
    expect(second).not.toBe(first)
  })
})
