import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'

type Status = 'pending' | 'requested' | 'grabbed' | 'notified'

const RECONCILE = { reconcileAvailability: true }
const HISTORY_TIMESTAMP = '2024-01-01T00:00:00.000Z'

describe('bulkUpdateWatchlistItems availability reset', () => {
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
  })

  describe.each([
    {
      arr: 'sonarr',
      type: 'show',
      junctionTable: 'watchlist_sonarr_instances',
      instanceColumn: 'sonarr_instance_id',
    },
    {
      arr: 'radarr',
      type: 'movie',
      junctionTable: 'watchlist_radarr_instances',
      instanceColumn: 'radarr_instance_id',
    },
  ] as const)('$arr', ({ type, junctionTable, instanceColumn }) => {
    const KEY = 'item-key'

    /**
     * Inserts a watchlist item with a junction row and a history row for
     * every status it has passed through, in the given state.
     */
    async function seedItem(
      status: Status,
      junctionStatus: Status = status,
      history: Status[] = [status],
    ): Promise<number> {
      const knex = getTestDatabase()
      const [item] = await knex('watchlist_items')
        .insert({ user_id: 1, title: 'Item', key: KEY, type, status })
        .returning('id')
      const id = typeof item === 'object' ? item.id : item

      await knex(junctionTable).insert({
        watchlist_id: id,
        [instanceColumn]: 1,
        status: junctionStatus,
        is_primary: true,
      })
      await knex('watchlist_status_history').insert(
        history.map((h) => ({
          watchlist_item_id: id,
          status: h,
          timestamp: HISTORY_TIMESTAMP,
        })),
      )
      return id
    }

    const mainStatus = async (id: number) =>
      (await getTestDatabase()('watchlist_items').where({ id }).first())?.status
    const junctionStatus = async (id: number) =>
      (
        await getTestDatabase()(junctionTable)
          .where({ watchlist_id: id })
          .first()
      )?.status
    const historyStatuses = async (id: number) =>
      (
        await getTestDatabase()('watchlist_status_history')
          .where({ watchlist_item_id: id })
          .orderBy('status')
      ).map((row) => row.status)

    const update = (status: Status) => ({
      userId: 1,
      key: KEY,
      status,
      [instanceColumn]: 1,
    })

    it('resets grabbed to requested when the caller opts in', async () => {
      const id = await seedItem('grabbed', 'grabbed', ['requested', 'grabbed'])

      const count = await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(count).toBe(1)
      expect(await mainStatus(id)).toBe('requested')
      expect(await junctionStatus(id)).toBe('requested')
    })

    it('writes a requested history entry when none exists yet', async () => {
      const id = await seedItem('grabbed', 'grabbed', ['grabbed'])

      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(await historyStatuses(id)).toEqual(['grabbed', 'requested'])
    })

    it('does not duplicate an existing requested history entry', async () => {
      const id = await seedItem('grabbed', 'grabbed', ['requested', 'grabbed'])

      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(await historyStatuses(id)).toEqual(['grabbed', 'requested'])
    })

    it('is idempotent once the reset has been applied', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )
      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(await mainStatus(id)).toBe('requested')
      expect(await junctionStatus(id)).toBe('requested')
    })

    it('keeps the status monotonic when the caller does not opt in', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateWatchlistItems([update('requested')])

      expect(await mainStatus(id)).toBe('grabbed')
      expect(await junctionStatus(id)).toBe('grabbed')
      expect(await historyStatuses(id)).toEqual(['grabbed'])
    })

    it('keeps the status monotonic when the option is explicitly false', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateWatchlistItems([update('requested')], {
        reconcileAvailability: false,
      })

      expect(await mainStatus(id)).toBe('grabbed')
      expect(await junctionStatus(id)).toBe('grabbed')
    })

    it('keeps the status monotonic for the show status helper', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateShowStatuses([
        { userId: 1, key: KEY, status: 'requested' },
      ])

      expect(await mainStatus(id)).toBe('grabbed')
    })

    it('never downgrades notified, with or without the option', async () => {
      const id = await seedItem('notified', 'notified', [
        'requested',
        'grabbed',
        'notified',
      ])

      await fastify.db.bulkUpdateWatchlistItems([update('requested')])
      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(await mainStatus(id)).toBe('notified')
      expect(await junctionStatus(id)).toBe('notified')
      expect(await historyStatuses(id)).toEqual([
        'grabbed',
        'notified',
        'requested',
      ])
    })

    it('leaves a notified junction row alone when the main row resets', async () => {
      const id = await seedItem('grabbed', 'notified')

      await fastify.db.bulkUpdateWatchlistItems(
        [update('requested')],
        RECONCILE,
      )

      expect(await mainStatus(id)).toBe('requested')
      expect(await junctionStatus(id)).toBe('notified')
    })

    it.each<[Status, Status]>([
      ['requested', 'pending'],
      ['grabbed', 'pending'],
    ])(
      'still ignores the %s -> %s regression when opted in',
      async (from, to) => {
        const id = await seedItem(from)

        await fastify.db.bulkUpdateWatchlistItems([update(to)], RECONCILE)

        expect(await mainStatus(id)).toBe(from)
        expect(await junctionStatus(id)).toBe(from)
      },
    )

    it('resets the main row when the update carries no instance id', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateWatchlistItems(
        [{ userId: 1, key: KEY, status: 'requested' }],
        RECONCILE,
      )

      expect(await mainStatus(id)).toBe('requested')
      // Junction rows are left to the junction processor
      expect(await junctionStatus(id)).toBe('grabbed')
    })

    it('keeps the main row grabbed without the option when no instance id is sent', async () => {
      const id = await seedItem('grabbed')

      await fastify.db.bulkUpdateWatchlistItems([
        { userId: 1, key: KEY, status: 'requested' },
      ])

      expect(await mainStatus(id)).toBe('grabbed')
    })

    it('still applies forward progression when opted in', async () => {
      const id = await seedItem('pending')

      await fastify.db.bulkUpdateWatchlistItems([update('grabbed')], RECONCILE)

      expect(await mainStatus(id)).toBe('grabbed')
      expect(await junctionStatus(id)).toBe('grabbed')
    })
  })
})
