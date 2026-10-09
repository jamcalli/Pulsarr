import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 102_add_watchlist_routing_failures', () => {
  let db: Knex

  beforeAll(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      migrations: { directory: './migrations/migrations' },
      pool: {
        min: 1,
        max: 1,
        afterCreate: (
          conn: unknown,
          done: (err: Error | null, conn: unknown) => void,
        ): void => {
          const sqliteConn = conn as { exec: (sql: string) => void }
          sqliteConn.exec('PRAGMA foreign_keys = ON;')
          done(null, conn)
        },
      },
    })

    let applied: string[]
    do {
      const [, files] = (await db.migrate.up()) as [number, string[]]
      if (files.length === 0) {
        throw new Error('Ran out of migrations before reaching 101')
      }
      applied = files
    } while (!applied[0]?.startsWith('101'))

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('102')

    await db('users').insert({ id: 1, name: 'watcher' })
    await db('watchlist_items').insert({
      id: 10,
      user_id: 1,
      key: 'k',
      title: 'K',
      type: 'movie',
    })
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('defaults an item-level failure to instance 0 with one attempt', async () => {
    await db('watchlist_routing_failures').insert({
      watchlist_item_id: 10,
      category: 'no_route',
    })

    const row = await db('watchlist_routing_failures').first()
    expect(row).toMatchObject({
      instance_id: 0,
      attempt_count: 1,
      message: '',
    })
    expect(row.first_failed_at).toBeTruthy()
    expect(row.last_failed_at).toBeTruthy()
  })

  it('allows one row per item and instance', async () => {
    await expect(
      db('watchlist_routing_failures').insert({
        watchlist_item_id: 10,
        category: 'arr_error',
      }),
    ).rejects.toThrow(/UNIQUE/)

    await db('watchlist_routing_failures').insert({
      watchlist_item_id: 10,
      instance_id: 2,
      category: 'arr_error',
    })
    expect(await db('watchlist_routing_failures')).toHaveLength(2)
  })

  it('rejects a row for a watchlist item that does not exist', async () => {
    await expect(
      db('watchlist_routing_failures').insert({
        watchlist_item_id: 999,
        category: 'arr_error',
      }),
    ).rejects.toThrow(/FOREIGN KEY/)
  })

  it('cascades the delete of a watchlist item', async () => {
    await db('watchlist_items').where({ id: 10 }).delete()
    expect(await db('watchlist_routing_failures')).toHaveLength(0)
  })

  it('drops the table on rollback', async () => {
    await db.migrate.down()
    expect(await db.schema.hasTable('watchlist_routing_failures')).toBe(false)
    expect(await db.schema.hasTable('watchlist_items')).toBe(true)
  })
})
