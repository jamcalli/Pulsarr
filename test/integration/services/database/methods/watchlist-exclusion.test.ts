import {
  WATCHLIST_EXCLUSION_ITEMS_DEFAULTS,
  type WatchlistExclusionItemsQuery,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedSystemUser, seedUsers } from '../../../../helpers/seeds/users.js'

const PRIMARY = 1
const SECOND = 2

const watchlistItem = (
  userId: number,
  key: string,
  title: string,
  type: 'movie' | 'show',
  status: 'pending' | 'requested' | 'grabbed' | 'notified',
  added: string,
) => ({
  user_id: userId,
  key,
  title,
  type,
  status,
  added,
  thumb: `https://img/${key}`,
  guids: JSON.stringify([`tmdb:${key}`]),
  created_at: added,
  updated_at: added,
})

const exclusion = (
  userId: number,
  key: string,
  title: string,
  type: string,
  excludedAt: string,
) => ({
  user_id: userId,
  key,
  title,
  type,
  guids: JSON.stringify([`tvdb:${key}`]),
  excluded_at: excludedAt,
})

const rowKeys = (items: Array<{ key: string; userId: number | null }>) =>
  items.map((item) => `${item.key}:${item.userId ?? 'global'}`)

describe('watchlist exclusion database methods', () => {
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
    fastify.contentRouter.clearRouterRulesCache()
  })

  describe('getWatchlistExclusionItems', () => {
    beforeEach(async () => {
      const knex = getTestDatabase()
      await knex('watchlist_items').insert([
        watchlistItem(
          PRIMARY,
          'plain',
          'Plain Movie',
          'movie',
          'pending',
          '2026-01-01',
        ),
        watchlistItem(
          PRIMARY,
          'own',
          'Own Show',
          'show',
          'grabbed',
          '2026-01-02',
        ),
        watchlistItem(
          SECOND,
          'own',
          'Own Show',
          'show',
          'requested',
          '2026-01-03',
        ),
        watchlistItem(
          SECOND,
          'blocked',
          'Blocked Movie',
          'movie',
          'notified',
          '2026-01-04',
        ),
        watchlistItem(
          PRIMARY,
          'both',
          'Both Movie',
          'movie',
          'requested',
          '2026-01-05',
        ),
      ])
      await knex('watchlist_exclusions').insert([
        exclusion(
          PRIMARY,
          'own',
          'Own Show',
          'show',
          '2026-02-01T00:00:00.000Z',
        ),
        exclusion(
          SECOND,
          'gone',
          'Gone Movie',
          'movie',
          '2026-02-02T00:00:00.000Z',
        ),
        exclusion(
          SYSTEM_USER_ID,
          'blocked',
          'Blocked Movie',
          'movie',
          '2026-02-03T00:00:00.000Z',
        ),
        exclusion(
          SYSTEM_USER_ID,
          'never',
          'Never Show',
          'show',
          '2026-02-04T00:00:00.000Z',
        ),
        exclusion(
          PRIMARY,
          'both',
          'Both Movie',
          'movie',
          '2026-02-05T00:00:00.000Z',
        ),
        exclusion(
          SYSTEM_USER_ID,
          'both',
          'Both Movie',
          'movie',
          '2026-02-06T00:00:00.000Z',
        ),
        exclusion(
          SECOND,
          'stray',
          'Stray Show',
          'show',
          '2026-02-07T00:00:00.000Z',
        ),
        exclusion(
          SYSTEM_USER_ID,
          'stray',
          'Stray Show',
          'show',
          '2026-02-08T00:00:00.000Z',
        ),
      ])
    })

    const list = (query: Partial<WatchlistExclusionItemsQuery> = {}) =>
      fastify.db.getWatchlistExclusionItems({
        ...WATCHLIST_EXCLUSION_ITEMS_DEFAULTS,
        ...query,
      })

    it('joins every row shape and sorts by exclusion time with unexcluded rows last', async () => {
      const items = await list()

      expect(rowKeys(items)).toEqual([
        'stray:2',
        'both:1',
        'never:global',
        'blocked:2',
        'gone:2',
        'own:1',
        'own:2',
        'plain:1',
      ])
    })

    it('returns a plain item with no exclusion', async () => {
      const [plain] = await list({ search: 'plain' })

      expect(plain).toEqual({
        key: 'plain',
        title: 'Plain Movie',
        type: 'movie',
        guids: ['tmdb:plain'],
        thumb: 'https://img/plain',
        userId: PRIMARY,
        userName: 'test-user-primary',
        status: 'pending',
        added: '2026-01-01',
        ownExclusion: null,
        globalExclusion: null,
      })
    })

    it('attaches the own exclusion only to the user who made it', async () => {
      const items = await list({ search: 'own' })
      const primary = items.find((item) => item.userId === PRIMARY)
      const second = items.find((item) => item.userId === SECOND)

      expect(primary?.ownExclusion).toEqual({
        id: expect.any(Number),
        excludedAt: '2026-02-01T00:00:00.000Z',
      })
      expect(primary?.status).toBe('grabbed')
      expect(second?.ownExclusion).toBeNull()
    })

    it('repeats the global exclusion on the watchlisted row', async () => {
      const [blocked] = await list({ search: 'blocked' })

      expect(blocked.userId).toBe(SECOND)
      expect(blocked.ownExclusion).toBeNull()
      expect(blocked.globalExclusion?.excludedAt).toBe(
        '2026-02-03T00:00:00.000Z',
      )
    })

    it('returns an orphan own exclusion with no watchlist fields', async () => {
      const [gone] = await list({ search: 'gone' })

      expect(gone).toMatchObject({
        key: 'gone',
        userId: SECOND,
        userName: 'test-user-discord-apprise',
        status: null,
        added: null,
        thumb: null,
        guids: ['tvdb:gone'],
        globalExclusion: null,
      })
      expect(gone.ownExclusion).not.toBeNull()
    })

    it('takes excludedAt from the own exclusion when a watchlisted row has both', async () => {
      const [both] = await list({ search: 'both' })

      expect(both.userId).toBe(PRIMARY)
      expect(both.ownExclusion).toEqual({
        id: expect.any(Number),
        excludedAt: '2026-02-05T00:00:00.000Z',
      })
      expect(both.globalExclusion).toEqual({
        id: expect.any(Number),
        excludedAt: '2026-02-06T00:00:00.000Z',
      })
    })

    it('attaches the global exclusion to an orphan own row and still emits the global row', async () => {
      const items = await list({ search: 'stray' })
      const own = items.find((item) => item.userId === SECOND)

      expect(rowKeys(items)).toEqual(['stray:2'])
      expect(own?.ownExclusion?.excludedAt).toBe('2026-02-07T00:00:00.000Z')
      expect(own?.globalExclusion?.excludedAt).toBe('2026-02-08T00:00:00.000Z')
    })

    it.each(['%', '_'])(
      'treats %s in the search as a literal character',
      async (search) => {
        expect(await list({ search })).toEqual([])
        expect(
          await fastify.db.getWatchlistExclusionItemsCount({ search }),
        ).toBe(0)
      },
    )

    it('returns an orphan global exclusion with no user', async () => {
      const [never] = await list({ search: 'never' })

      expect(never).toMatchObject({
        key: 'never',
        type: 'show',
        userId: null,
        userName: null,
        status: null,
        ownExclusion: null,
      })
      expect(never.globalExclusion).not.toBeNull()
    })

    it.each([
      [{ search: 'MOVIE' }, ['both:1', 'blocked:2', 'gone:2', 'plain:1']],
      [{ userId: SECOND }, ['stray:2', 'blocked:2', 'gone:2', 'own:2']],
      [{ type: 'show' }, ['stray:2', 'never:global', 'own:1', 'own:2']],
      [{ status: 'grabbed' }, ['own:1']],
      [
        { exclusion: 'excluded' },
        ['stray:2', 'both:1', 'never:global', 'blocked:2', 'gone:2', 'own:1'],
      ],
      [{ exclusion: 'not-excluded' }, ['own:2', 'plain:1']],
      [{ exclusion: 'orphan' }, ['stray:2', 'never:global', 'gone:2']],
    ] as const)('filters by %j', async (filter, expected) => {
      const items = await list(filter)
      const total = await fastify.db.getWatchlistExclusionItemsCount(filter)

      expect(rowKeys(items)).toEqual(expected)
      expect(total).toBe(expected.length)
    })

    it.each([
      [
        { sortBy: 'title', sortOrder: 'asc' },
        [
          'blocked:2',
          'both:1',
          'gone:2',
          'never:global',
          'own:1',
          'own:2',
          'plain:1',
          'stray:2',
        ],
      ],
      [
        { sortBy: 'userName', sortOrder: 'asc' },
        [
          'blocked:2',
          'gone:2',
          'own:2',
          'stray:2',
          'both:1',
          'own:1',
          'plain:1',
          'never:global',
        ],
      ],
      [
        { sortBy: 'status', sortOrder: 'asc' },
        [
          'own:1',
          'blocked:2',
          'plain:1',
          'both:1',
          'own:2',
          'gone:2',
          'never:global',
          'stray:2',
        ],
      ],
      [
        { sortBy: 'added', sortOrder: 'desc' },
        [
          'both:1',
          'blocked:2',
          'own:2',
          'own:1',
          'plain:1',
          'gone:2',
          'never:global',
          'stray:2',
        ],
      ],
      [
        { sortBy: 'excludedAt', sortOrder: 'asc' },
        [
          'own:1',
          'gone:2',
          'blocked:2',
          'never:global',
          'both:1',
          'stray:2',
          'own:2',
          'plain:1',
        ],
      ],
    ] as const)('sorts by %j', async (sort, expected) => {
      expect(rowKeys(await list(sort))).toEqual(expected)
    })

    it('pages over the filtered set while the count covers every page', async () => {
      const page = await list({
        sortBy: 'title',
        sortOrder: 'asc',
        limit: 2,
        offset: 2,
      })
      const total = await fastify.db.getWatchlistExclusionItemsCount({})

      expect(rowKeys(page)).toEqual(['gone:2', 'never:global'])
      expect(total).toBe(8)
    })
  })

  describe('bulkExcludeWatchlistItems', () => {
    it('reports created and skipped rows per user', async () => {
      await fastify.db.excludeWatchlistItem(
        'dup',
        [PRIMARY],
        'Dup',
        'movie',
        [],
      )

      const result = await fastify.db.bulkExcludeWatchlistItems(
        [
          {
            key: 'dup',
            userIds: [PRIMARY, SECOND],
            title: 'Dup',
            type: 'movie',
            guids: [],
          },
          {
            key: 'fresh',
            userIds: [SECOND],
            title: 'Fresh',
            type: 'show',
            guids: ['tvdb:1'],
          },
        ],
        'users',
      )

      expect(result).toEqual({ created: 2, skipped: 1, failed: [], errors: [] })
    })

    it('writes one system row per item for the global scope', async () => {
      const result = await fastify.db.bulkExcludeWatchlistItems(
        [
          {
            key: 'global',
            userIds: [PRIMARY, SECOND],
            title: 'Global',
            type: 'movie',
            guids: [],
          },
        ],
        'global',
      )

      const rows = await getTestDatabase()('watchlist_exclusions').where(
        'key',
        'global',
      )
      expect(result.created).toBe(1)
      expect(rows.map((row) => row.user_id)).toEqual([SYSTEM_USER_ID])
    })

    it('fails one item without rolling back the others', async () => {
      const result = await fastify.db.bulkExcludeWatchlistItems(
        [
          {
            key: 'unknown-user',
            userIds: [999],
            title: 'Unknown',
            type: 'movie',
            guids: [],
          },
          {
            key: 'kept',
            userIds: [PRIMARY],
            title: 'Kept',
            type: 'movie',
            guids: [],
          },
        ],
        'users',
      )

      const kept = await getTestDatabase()('watchlist_exclusions').where(
        'key',
        'kept',
      )
      expect(result.created).toBe(1)
      expect(result.failed).toEqual(['unknown-user'])
      expect(result.errors).toHaveLength(1)
      expect(kept).toHaveLength(1)
    })
  })

  describe('bulkRemoveExclusions', () => {
    it('reports removed rows and ids that matched nothing', async () => {
      await fastify.db.excludeWatchlistItem(
        'a',
        [PRIMARY, SECOND],
        'A',
        'movie',
        [],
      )
      const ids = await getTestDatabase()('watchlist_exclusions').pluck('id')

      const result = await fastify.db.bulkRemoveExclusions([
        ...ids,
        ids[0],
        9999,
        9999,
      ])

      expect(result).toEqual({
        removed: 2,
        failed: [9999],
        errors: ['Exclusion 9999 not found'],
        total: 3,
      })
      expect(
        await getTestDatabase()('watchlist_exclusions').count('* as count'),
      ).toEqual([{ count: 0 }])
    })
  })
})
