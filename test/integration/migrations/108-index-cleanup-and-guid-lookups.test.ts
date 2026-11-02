import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { up as rerun108 } from '../../../migrations/migrations/108_20261030_index_cleanup_and_guid_lookups.js'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 108_index_cleanup_and_guid_lookups', () => {
  let db: Knex

  const item = (id: number, guids: string[]) => ({
    id,
    user_id: 1,
    key: `item-${id}`,
    title: `Item ${id}`,
    type: 'movie',
    guids: JSON.stringify(guids),
    genres: '[]',
    status: 'pending',
  })

  const tracking = (
    id: number,
    guids: string[],
    labels: string[],
    syncedAt: string,
    ratingKey = 'rk1',
  ) => ({
    id,
    content_guids: JSON.stringify(guids),
    content_type: 'movie',
    user_id: 1,
    plex_rating_key: ratingKey,
    labels_applied: JSON.stringify(labels),
    synced_at: syncedAt,
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
        throw new Error('Ran out of migrations before reaching 107')
      }
      applied = files
    } while (!applied[0]?.startsWith('107'))

    await db('users').insert({ id: 1, name: 'alice' })
    await db('watchlist_items').insert([
      item(1, ['IMDB://tt0111161', 'tmdb:278']),
      item(2, ['tmdb:278', 'TMDB:278', 'tmdb://278']),
      item(3, ['imdb:tt0068646', 'tmdb:238']),
      { ...item(4, []), guids: 'not json' },
    ])

    await db('plex_label_tracking').insert([
      tracking(1, ['IMDB://tt0111161'], ['pulsarr:alice'], '2026-01-01'),
      tracking(2, ['imdb:tt0111161'], ['pulsarr:4k'], '2026-03-01'),
      tracking(3, ['Imdb:tt0111161'], ['pulsarr:alice'], '2026-02-01'),
      tracking(4, ['imdb:tt0111161'], ['pulsarr:other'], '2026-01-01', 'rk2'),
      tracking(
        5,
        ['TVDB://81189', 'tvdb:81189'],
        ['pulsarr:show'],
        '2026-01-01',
      ),
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('108')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const guidsOf = async (id: number) => {
    const row = await db('watchlist_items').where({ id }).first()
    return row.guids
  }

  it('normalizes case and provider:// in watchlist item guids', async () => {
    expect(JSON.parse(await guidsOf(1))).toEqual(['imdb:tt0111161', 'tmdb:278'])
  })

  it('dedupes guids within an array, keeping first-occurrence order', async () => {
    expect(JSON.parse(await guidsOf(2))).toEqual(['tmdb:278'])
  })

  it('leaves already-normalized rows byte for byte', async () => {
    expect(await guidsOf(3)).toBe('["imdb:tt0068646","tmdb:238"]')
  })

  it('skips rows whose guids are not a JSON array', async () => {
    expect(await guidsOf(4)).toBe('not json')
  })

  it('drops redundant indexes and keeps the unique ones', async () => {
    const names = await db('sqlite_master')
      .where({ type: 'index', tbl_name: 'watchlist_items' })
      .pluck('name')

    expect(names).toContain('watchlist_items_user_id_key_unique')
    expect(names).not.toContain('watchlist_items_user_id_key_index')
    expect(names).not.toContain('watchlist_items_guids_index')
  })

  it('merges colliding tracking rows into the newest id with labels unioned', async () => {
    const rows = await db('plex_label_tracking')
      .orderBy('id')
      .select('id', 'content_guids', 'labels_applied', 'synced_at')

    expect(rows.map((row) => row.id)).toEqual([3, 4, 5])
    expect(rows[0]).toEqual({
      id: 3,
      content_guids: '["imdb:tt0111161"]',
      labels_applied: '["pulsarr:4k","pulsarr:alice"]',
      synced_at: '2026-03-01',
    })
  })

  it('keeps tracking rows that differ by rating key and normalizes them in place', async () => {
    const rows = await db('plex_label_tracking')
      .whereIn('id', [4, 5])
      .orderBy('id')
      .pluck('content_guids')

    expect(rows).toEqual(['["imdb:tt0111161"]', '["tvdb:81189"]'])
  })

  it('is idempotent', async () => {
    const snapshot = async () => ({
      items: await db('watchlist_items').orderBy('id').select('*'),
      tracking: await db('plex_label_tracking').orderBy('id').select('*'),
    })
    const before = await snapshot()
    await rerun108(db)
    expect(await snapshot()).toEqual(before)
  })
})
