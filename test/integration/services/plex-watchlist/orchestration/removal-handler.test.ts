import type { Friend, TokenWatchlistItem } from '@root/types/plex.types.js'
import { checkForRemovedItems } from '@services/plex-watchlist/orchestration/removal-handler.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedSystemUser, seedUsers } from '../../../../helpers/seeds/users.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const USER_ID = 1
const KEY = 'plex://movie/dune'
const NOW = '2026-10-01T00:00:00.000Z'

const user: Friend = {
  watchlistId: 'wl-1',
  username: 'primary',
  userId: USER_ID,
}

async function seedExcludedGrabbedItem() {
  const knex = getTestDatabase()
  await knex('watchlist_items').insert({
    user_id: USER_ID,
    key: KEY,
    title: 'Dune',
    type: 'movie',
    status: 'grabbed',
    added: NOW,
    thumb: 'https://img/dune',
    guids: JSON.stringify(['tmdb:438631']),
    created_at: NOW,
    updated_at: NOW,
  })
  await knex('watchlist_exclusions').insert({
    user_id: USER_ID,
    key: KEY,
    title: 'Dune',
    type: 'movie',
    guids: JSON.stringify(['tmdb:438631']),
    excluded_at: NOW,
  })
}

async function exclusionsFor(userId: number) {
  return getTestDatabase()('watchlist_exclusions').where('user_id', userId)
}

describe('removal handler clears exclusions', () => {
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
    await seedSystemUser(knex)
    await seedExcludedGrabbedItem()
  })

  it('clears the user exclusion when the title leaves their Plex watchlist', async () => {
    const plexWatchlist = new Map<Friend, Set<TokenWatchlistItem>>([
      [user, new Set()],
    ])

    await checkForRemovedItems(plexWatchlist, {
      db: fastify.db,
      logger: createMockLogger(),
    })

    expect(await exclusionsFor(USER_ID)).toHaveLength(0)
  })

  it('clears the exclusion when the watchlist row is already gone', async () => {
    await getTestDatabase()('watchlist_items').where('user_id', USER_ID).del()
    const plexWatchlist = new Map<Friend, Set<TokenWatchlistItem>>([
      [user, new Set()],
    ])

    await checkForRemovedItems(plexWatchlist, {
      db: fastify.db,
      logger: createMockLogger(),
    })

    expect(await exclusionsFor(USER_ID)).toHaveLength(0)
  })
})
