import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 107_notification_claim_unique', () => {
  let db: Knex

  const row = (
    id: number,
    type: string,
    overrides: Record<string, string | number | null> = {},
  ) => ({
    id,
    type,
    user_id: 1,
    watchlist_item_id: 1,
    title: 'Some Title',
    notification_status: 'active',
    created_at: '2026-01-01 00:00:00',
    ...overrides,
  })

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
        throw new Error('Ran out of migrations before reaching 106')
      }
      applied = files
    } while (!applied[0]?.startsWith('106'))

    await db('users').insert({ id: 1, name: 'alice' })
    await db('watchlist_items').insert({
      id: 1,
      user_id: 1,
      key: 'item-1',
      title: 'Some Title',
      type: 'show',
      guids: '[]',
      genres: '[]',
      status: 'pending',
    })

    await db('notifications').insert([
      row(1, 'movie'),
      row(2, 'movie'),
      row(3, 'season', { season_number: 2 }),
      row(4, 'season', { season_number: 2 }),
      row(5, 'season', { season_number: 3 }),
      row(6, 'movie', { user_id: null, watchlist_item_id: null }),
      row(7, 'movie', { user_id: null, watchlist_item_id: null }),
      row(8, 'movie', {
        user_id: null,
        watchlist_item_id: null,
        title: 'Other',
      }),
      row(9, 'approval_resolved', { watchlist_item_id: null }),
      row(10, 'approval_resolved', { watchlist_item_id: null }),
      row(11, 'watchlist_cap', { watchlist_item_id: null }),
      row(12, 'watchlist_cap', { watchlist_item_id: null }),
      row(13, 'movie', { notification_status: 'reset' }),
      row(14, 'movie', { notification_status: 'reset' }),
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('107')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const ids = () => db('notifications').orderBy('id').pluck('id')

  it('collapses duplicate active user claims to the newest row', async () => {
    expect(await ids()).not.toContain(1)
    expect(await ids()).not.toContain(3)
    expect(await ids()).toEqual(expect.arrayContaining([2, 4, 5]))
  })

  it('collapses duplicate public claims by title', async () => {
    expect(await ids()).not.toContain(6)
    expect(await ids()).toEqual(expect.arrayContaining([7, 8]))
  })

  it('keeps every history row and every non-active row', async () => {
    expect(await ids()).toEqual(expect.arrayContaining([9, 10, 11, 12, 13, 14]))
  })

  it('rejects a new duplicate active claim', async () => {
    await expect(db('notifications').insert(row(15, 'movie'))).rejects.toThrow(
      /UNIQUE/,
    )
  })

  it('drops the old key', async () => {
    const indexes = await db('sqlite_master')
      .where({ type: 'index', name: 'notifications_unique_content_user' })
      .pluck('name')
    expect(indexes).toEqual([])
  })
})
