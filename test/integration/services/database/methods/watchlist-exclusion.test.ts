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

const rowKeys = (items: Array<{ key: string }>) => items.map((item) => item.key)

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

    it('groups by title and sorts by the newest exclusion with unexcluded rows last', async () => {
      const items = await list()

      expect(rowKeys(items)).toEqual([
        'stray',
        'both',
        'never',
        'blocked',
        'gone',
        'own',
        'plain',
      ])
    })

    it('returns a plain title with its one watchlister', async () => {
      const [plain] = await list({ search: 'plain' })

      expect(plain).toEqual({
        key: 'plain',
        title: 'Plain Movie',
        type: 'movie',
        guids: ['tmdb:plain'],
        thumb: 'https://img/plain',
        globalExclusion: null,
        watchlisterCount: 1,
        excludedCount: 0,
        users: [
          {
            userId: PRIMARY,
            userName: 'test-user-primary',
            status: 'pending',
            added: '2026-01-01',
            ownExclusion: null,
          },
        ],
      })
    })

    it('lists every watchlister by name with the own exclusion only on its user', async () => {
      const [own] = await list({ search: 'own' })

      expect(own).toMatchObject({
        key: 'own',
        watchlisterCount: 2,
        excludedCount: 1,
        globalExclusion: null,
      })
      expect(own.users).toEqual([
        {
          userId: SECOND,
          userName: 'test-user-discord-apprise',
          status: 'requested',
          added: '2026-01-03',
          ownExclusion: null,
        },
        {
          userId: PRIMARY,
          userName: 'test-user-primary',
          status: 'grabbed',
          added: '2026-01-02',
          ownExclusion: {
            id: expect.any(Number),
            excludedAt: '2026-02-01T00:00:00.000Z',
          },
        },
      ])
    })

    it('puts the global exclusion on the title row', async () => {
      const [blocked] = await list({ search: 'blocked' })

      expect(blocked.globalExclusion?.excludedAt).toBe(
        '2026-02-03T00:00:00.000Z',
      )
      expect(blocked.excludedCount).toBe(0)
      expect(blocked.users).toMatchObject([
        { userId: SECOND, status: 'notified', ownExclusion: null },
      ])
    })

    it('returns an orphan own exclusion as a user with no watchlist fields', async () => {
      const [gone] = await list({ search: 'gone' })

      expect(gone).toEqual({
        key: 'gone',
        title: 'Gone Movie',
        type: 'movie',
        guids: ['tvdb:gone'],
        thumb: null,
        globalExclusion: null,
        watchlisterCount: 0,
        excludedCount: 1,
        users: [
          {
            userId: SECOND,
            userName: 'test-user-discord-apprise',
            status: null,
            added: null,
            ownExclusion: {
              id: expect.any(Number),
              excludedAt: '2026-02-02T00:00:00.000Z',
            },
          },
        ],
      })
    })

    it('carries both exclusions when a title has own and global', async () => {
      const [both] = await list({ search: 'both' })

      expect(both.globalExclusion).toEqual({
        id: expect.any(Number),
        excludedAt: '2026-02-06T00:00:00.000Z',
      })
      expect(both.excludedCount).toBe(1)
      expect(both.users[0].ownExclusion).toEqual({
        id: expect.any(Number),
        excludedAt: '2026-02-05T00:00:00.000Z',
      })
    })

    it('folds an orphan own exclusion and the global one into one title row', async () => {
      const items = await list({ search: 'stray' })

      expect(rowKeys(items)).toEqual(['stray'])
      expect(items[0].globalExclusion?.excludedAt).toBe(
        '2026-02-08T00:00:00.000Z',
      )
      expect(items[0].users).toMatchObject([
        {
          userId: SECOND,
          status: null,
          ownExclusion: { excludedAt: '2026-02-07T00:00:00.000Z' },
        },
      ])
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

    it('returns a global exclusion no one has watchlisted with no users', async () => {
      const [never] = await list({ search: 'never' })

      expect(never).toMatchObject({
        key: 'never',
        type: 'show',
        watchlisterCount: 0,
        excludedCount: 0,
        users: [],
      })
      expect(never.globalExclusion).not.toBeNull()
    })

    it('keeps every user on a title matched by one user or status', async () => {
      const [bySecond] = await list({ userId: SECOND, search: 'own' })
      const [byGrabbed] = await list({ status: 'grabbed' })

      expect(bySecond.users.map((user) => user.userId)).toEqual([
        SECOND,
        PRIMARY,
      ])
      expect(byGrabbed.users.map((user) => user.status)).toEqual([
        'requested',
        'grabbed',
      ])
    })

    it.each([
      [{ search: 'MOVIE' }, ['both', 'blocked', 'gone', 'plain']],
      [{ userId: SECOND }, ['stray', 'blocked', 'gone', 'own']],
      [{ type: 'show' }, ['stray', 'never', 'own']],
      [{ status: 'grabbed' }, ['own']],
      [{ status: 'requested' }, ['both', 'own']],
      [
        { exclusion: 'excluded' },
        ['stray', 'both', 'never', 'blocked', 'gone', 'own'],
      ],
      [{ exclusion: 'not-excluded' }, ['plain']],
      [{ exclusion: 'orphan' }, ['stray', 'never', 'gone']],
    ] as const)('filters by %j', async (filter, expected) => {
      const items = await list(filter)
      const total = await fastify.db.getWatchlistExclusionItemsCount(filter)

      expect(rowKeys(items)).toEqual(expected)
      expect(total).toBe(expected.length)
    })

    it.each([
      [
        { sortBy: 'title', sortOrder: 'asc' },
        ['blocked', 'both', 'gone', 'never', 'own', 'plain', 'stray'],
      ],
      [
        { sortBy: 'watchlisters', sortOrder: 'desc' },
        ['own', 'blocked', 'both', 'plain', 'gone', 'never', 'stray'],
      ],
      [
        { sortBy: 'watchlisters', sortOrder: 'asc' },
        ['gone', 'never', 'stray', 'blocked', 'both', 'plain', 'own'],
      ],
      [
        { sortBy: 'excluded', sortOrder: 'desc' },
        ['both', 'gone', 'own', 'stray', 'blocked', 'never', 'plain'],
      ],
      [
        { sortBy: 'excludedAt', sortOrder: 'asc' },
        ['own', 'gone', 'blocked', 'never', 'both', 'stray', 'plain'],
      ],
    ] as const)('sorts by %j', async (sort, expected) => {
      expect(rowKeys(await list(sort))).toEqual(expected)
    })

    it('pages over titles while the count covers every page', async () => {
      const page = await list({
        sortBy: 'title',
        sortOrder: 'asc',
        limit: 2,
        offset: 2,
      })
      const total = await fastify.db.getWatchlistExclusionItemsCount({})

      expect(rowKeys(page)).toEqual(['gone', 'never'])
      expect(total).toBe(7)
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
