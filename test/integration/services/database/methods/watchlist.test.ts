import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'
import { seedWatchlist } from '../../../../helpers/seeds/watchlist.js'

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
        guids: JSON.stringify(['TMDB:105', 'tvdb:76648']),
        genres: JSON.stringify([]),
        status: 'requested',
      },
    ])
    fastify.contentRouter.clearRouterRulesCache()
  })

  it('returns only the movie for a movie lookup', async () => {
    const items = await fastify.db.getWatchlistItemsByGuid('tmdb:105', 'movie')

    expect(items.map((item) => item.key)).toEqual(['shared-tmdb-movie'])
  })

  it('returns only the show for a show lookup, matching case-insensitively', async () => {
    const items = await fastify.db.getWatchlistItemsByGuid('tmdb:105', 'show')

    expect(items.map((item) => item.key)).toEqual(['shared-tmdb-show'])
  })
})
