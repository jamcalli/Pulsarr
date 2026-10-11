import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 102_null_safe_plex_label_tracking_unique', () => {
  let db: Knex

  const row = (id: number, userId: number | null, ratingKey: string) => ({
    id,
    content_guids: '["imdb:tt0111161"]',
    content_type: 'movie',
    user_id: userId,
    plex_rating_key: ratingKey,
    labels_applied: `["label-${id}"]`,
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
        throw new Error('Ran out of migrations before reaching 101')
      }
      applied = files
    } while (!applied[0]?.startsWith('101'))

    await db('users').insert({ id: 1, name: 'alice' })

    await db('plex_label_tracking').insert([
      row(1, null, 'rk1'),
      row(2, null, 'rk1'),
      row(3, null, 'rk2'),
      row(4, 1, 'rk1'),
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('102')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('leaves SQLite rows untouched', async () => {
    const rows = await db('plex_label_tracking')
      .orderBy('id')
      .select('id', 'labels_applied')
    expect(rows).toEqual([
      { id: 1, labels_applied: '["label-1"]' },
      { id: 2, labels_applied: '["label-2"]' },
      { id: 3, labels_applied: '["label-3"]' },
      { id: 4, labels_applied: '["label-4"]' },
    ])
  })

  it('adds no index on SQLite', async () => {
    const indexes = await db('sqlite_master')
      .where({ type: 'index', name: 'plex_label_tracking_content_unique' })
      .pluck('name')
    expect(indexes).toEqual([])
  })
})
