import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'
import { seedWatchlist } from '../../../../helpers/seeds/watchlist.js'

const MOVIE_KEY = '5d77683585719b001f3a3946'
const JUNCTION_TIMESTAMP = '2020-01-01 00:00:00'

const itemFor = (key: string) =>
  getTestDatabase()('watchlist_items').where({ user_id: 1, key }).first()

const junctionFor = async (key: string) => {
  const item = await itemFor(key)
  return getTestDatabase()('watchlist_radarr_instances')
    .where({ watchlist_id: item.id, radarr_instance_id: 1 })
    .first()
}

describe('updateWatchlistItem', () => {
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
    await seedWatchlist(knex)
    await knex('watchlist_items')
      .where({ key: MOVIE_KEY })
      .update({ status: 'pending' })
    const item = await itemFor(MOVIE_KEY)
    await knex('watchlist_radarr_instances').insert({
      watchlist_id: item.id,
      radarr_instance_id: 1,
      status: 'pending',
      is_primary: true,
      syncing: false,
      created_at: JUNCTION_TIMESTAMP,
      updated_at: JUNCTION_TIMESTAMP,
    })
    fastify.caches.clear()
  })

  it('reports a write when the status progresses', async () => {
    expect(
      await fastify.db.updateWatchlistItem(1, MOVIE_KEY, {
        status: 'requested',
      }),
    ).toBe(true)

    expect((await itemFor(MOVIE_KEY)).status).toBe('requested')
  })

  it.each(['requested', 'grabbed', 'notified'] as const)(
    'reports no write for an item already %s and leaves its junction alone',
    async (status) => {
      await getTestDatabase()('watchlist_items')
        .where({ key: MOVIE_KEY })
        .update({ status })

      expect(
        await fastify.db.updateWatchlistItem(1, MOVIE_KEY, {
          status: 'requested',
        }),
      ).toBe(false)

      const junction = await junctionFor(MOVIE_KEY)
      expect(junction.updated_at).toBe(JUNCTION_TIMESTAMP)
      expect(junction.status).toBe('pending')
      expect(Boolean(junction.is_primary)).toBe(true)
    },
  )

  it('reports no write inside an external transaction for a no-op', async () => {
    await getTestDatabase()('watchlist_items')
      .where({ key: MOVIE_KEY })
      .update({ status: 'grabbed' })

    const written = await getTestDatabase().transaction((trx) =>
      fastify.db.updateWatchlistItem(
        1,
        MOVIE_KEY,
        { status: 'requested' },
        trx,
      ),
    )

    expect(written).toBe(false)
  })

  it('reports no write for a missing item', async () => {
    expect(
      await fastify.db.updateWatchlistItem(1, 'missing-key', {
        status: 'requested',
      }),
    ).toBe(false)
  })
})

describe('getWatchlistItemsByGuid', () => {
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
    await seedWatchlist(knex)
    await knex('watchlist_items').insert([
      {
        user_id: 1,
        title: 'Back to the Future',
        key: 'shared-tmdb-movie',
        type: 'movie',
        guids: JSON.stringify(['tmdb:105', 'imdb:tt0088763']),
        genres: JSON.stringify([]),
        status: 'requested',
      },
      {
        user_id: 2,
        title: 'Sex and the City',
        key: 'shared-tmdb-show',
        type: 'show',
        guids: JSON.stringify(['tmdb:105', 'tvdb:76648']),
        genres: JSON.stringify([]),
        status: 'requested',
      },
    ])
    fastify.caches.clear()
  })

  it('returns only the movie for a movie lookup', async () => {
    const items = await fastify.db.getWatchlistItemsByGuid('tmdb:105', 'movie')

    expect(items.map((item) => item.key)).toEqual(['shared-tmdb-movie'])
  })

  it('returns only the show for a show lookup, normalizing the input guid', async () => {
    const items = await fastify.db.getWatchlistItemsByGuid('TMDB://105', 'show')

    expect(items.map((item) => item.key)).toEqual(['shared-tmdb-show'])
  })

  it('does not match a guid that is a string prefix of a stored one', async () => {
    expect(
      await fastify.db.getWatchlistItemsByGuid('tmdb:10', 'movie'),
    ).toEqual([])
  })
})

describe('getWatchlistItemsWithUsersByGuids', () => {
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
    await seedWatchlist(knex)
    await knex('watchlist_items').insert([
      {
        user_id: 1,
        title: 'Back to the Future',
        key: 'guid-lookup-movie',
        type: 'movie',
        guids: JSON.stringify(['tmdb:9999105', 'imdb:tt9990088763']),
        genres: JSON.stringify([]),
        status: 'requested',
      },
      {
        user_id: 2,
        title: 'Sex and the City',
        key: 'guid-lookup-show',
        type: 'show',
        guids: JSON.stringify(['tvdb:9999648']),
        genres: JSON.stringify([]),
        status: 'requested',
      },
    ])
    fastify.caches.clear()
  })

  it('matches any of several normalized guids and returns each item once', async () => {
    const items = await fastify.db.getWatchlistItemsWithUsersByGuids([
      'TMDB://9999105',
      'imdb:tt9990088763',
      'tvdb:9999648',
    ])

    expect(items.map((item) => item.key).sort()).toEqual([
      'guid-lookup-movie',
      'guid-lookup-show',
    ])
  })

  it('does not match a guid that is a string prefix of a stored one', async () => {
    expect(
      await fastify.db.getWatchlistItemsWithUsersByGuids(['tvdb:999964']),
    ).toEqual([])
  })
})
