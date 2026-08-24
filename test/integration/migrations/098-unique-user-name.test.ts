import { isUniqueViolation } from '@utils/db-errors.js'
import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB: the shared test singleton is already migrated to
// latest, so this suite drives its own connection to test 098 in isolation.
describe('migration 098_add_unique_user_name', () => {
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

    // Migrate to 097 so duplicates can be seeded before the constraint lands
    let applied: string[]
    do {
      const [, files] = (await db.migrate.up()) as [number, string[]]
      if (files.length === 0) {
        throw new Error('Ran out of migrations before reaching 097')
      }
      applied = files
    } while (!applied[0]?.startsWith('097'))

    // alice: duplicate pair where the primary-token row is newer than the
    // other; bob: duplicate pair with no primary; carol: no duplicates
    await db('users').insert([
      { id: 1, name: 'alice', is_primary_token: false },
      { id: 2, name: 'alice', is_primary_token: true },
      { id: 3, name: 'bob', is_primary_token: false },
      { id: 4, name: 'bob', is_primary_token: false },
      { id: 5, name: 'carol', is_primary_token: false },
    ])

    await db('watchlist_items').insert([
      { id: 10, user_id: 2, key: 'shared', title: 'Shared', type: 'movie' },
      { id: 11, user_id: 1, key: 'shared', title: 'Shared', type: 'movie' },
      { id: 12, user_id: 1, key: 'solo', title: 'Solo', type: 'movie' },
    ])

    await db('notifications').insert([
      { id: 20, user_id: 1, watchlist_item_id: 11, type: 'movie', title: 'A' },
      { id: 21, user_id: 1, watchlist_item_id: 12, type: 'movie', title: 'B' },
    ])

    await db('user_quotas').insert([
      {
        user_id: 2,
        content_type: 'movie',
        quota_type: 'daily',
        quota_limit: 5,
      },
      {
        user_id: 1,
        content_type: 'movie',
        quota_type: 'daily',
        quota_limit: 3,
      },
      {
        user_id: 1,
        content_type: 'show',
        quota_type: 'daily',
        quota_limit: 3,
      },
    ])

    await db('quota_usage').insert([
      { user_id: 1, content_type: 'movie', request_date: '2026-08-01' },
    ])

    await db('approval_requests').insert([
      {
        user_id: 2,
        content_type: 'movie',
        content_title: 'Shared',
        content_key: 'ck-shared',
        router_decision: '{}',
        triggered_by: 'quota_exceeded',
      },
      {
        user_id: 1,
        content_type: 'movie',
        content_title: 'Shared',
        content_key: 'ck-shared',
        router_decision: '{}',
        triggered_by: 'quota_exceeded',
      },
      {
        user_id: 1,
        content_type: 'movie',
        content_title: 'Solo',
        content_key: 'ck-solo',
        router_decision: '{}',
        triggered_by: 'quota_exceeded',
      },
    ])

    // rk2 matches the keeper on guids and type but tracks a different Plex
    // item, so it must be repointed, not dropped as a collision
    await db('plex_label_tracking').insert([
      {
        user_id: 2,
        content_guids: '["g1"]',
        content_type: 'movie',
        plex_rating_key: 'rk1',
        labels_applied: '[]',
      },
      {
        user_id: 1,
        content_guids: '["g1"]',
        content_type: 'movie',
        plex_rating_key: 'rk1',
        labels_applied: '[]',
      },
      {
        user_id: 1,
        content_guids: '["g1"]',
        content_type: 'movie',
        plex_rating_key: 'rk2',
        labels_applied: '[]',
      },
    ])

    await db('watchlist_exclusions').insert([
      {
        user_id: 2,
        key: 'ex-shared',
        title: 'Shared',
        type: 'movie',
        guids: '[]',
      },
      {
        user_id: 1,
        key: 'ex-shared',
        title: 'Shared',
        type: 'movie',
        guids: '[]',
      },
      {
        user_id: 1,
        key: 'ex-solo',
        title: 'Solo',
        type: 'movie',
        guids: '[]',
      },
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('098')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('keeps the primary-token row over an older duplicate', async () => {
    const alices = await db('users').where({ name: 'alice' })
    expect(alices).toHaveLength(1)
    expect(alices[0].id).toBe(2)
  })

  it('keeps the oldest row when no duplicate is primary', async () => {
    const bobs = await db('users').where({ name: 'bob' })
    expect(bobs).toHaveLength(1)
    expect(bobs[0].id).toBe(3)
  })

  it('leaves non-duplicated users untouched', async () => {
    // 'System' is seeded by an earlier migration
    const users = await db('users').orderBy('id')
    expect(users.map((u) => u.name)).toEqual([
      'System',
      'alice',
      'bob',
      'carol',
    ])
  })

  it('repoints non-colliding watchlist items and drops colliding ones', async () => {
    const items = await db('watchlist_items').orderBy('id')
    expect(items).toEqual([
      expect.objectContaining({ id: 10, user_id: 2, key: 'shared' }),
      expect.objectContaining({ id: 12, user_id: 2, key: 'solo' }),
    ])
  })

  it('cascades notifications of dropped items and repoints the rest', async () => {
    const notifications = await db('notifications').orderBy('id')
    expect(notifications).toEqual([
      expect.objectContaining({ id: 21, user_id: 2, watchlist_item_id: 12 }),
    ])
  })

  it('keeps the keeper quota on collision and repoints the other content type', async () => {
    const quotas = await db('user_quotas')
      .where({ user_id: 2 })
      .orderBy('content_type')
    expect(quotas).toEqual([
      expect.objectContaining({ content_type: 'movie', quota_limit: 5 }),
      expect.objectContaining({ content_type: 'show', quota_limit: 3 }),
    ])
    expect(await db('user_quotas').whereNot({ user_id: 2 })).toHaveLength(0)
  })

  it('repoints quota usage wholesale', async () => {
    const usage = await db('quota_usage')
    expect(usage).toEqual([expect.objectContaining({ user_id: 2 })])
  })

  it('merges approval requests by content key', async () => {
    const requests = await db('approval_requests').orderBy('content_key')
    expect(requests).toEqual([
      expect.objectContaining({ user_id: 2, content_key: 'ck-shared' }),
      expect.objectContaining({ user_id: 2, content_key: 'ck-solo' }),
    ])
  })

  it('repoints label tracking rows that differ only by rating key', async () => {
    const tracking = await db('plex_label_tracking').orderBy('plex_rating_key')
    expect(tracking).toEqual([
      expect.objectContaining({ user_id: 2, plex_rating_key: 'rk1' }),
      expect.objectContaining({ user_id: 2, plex_rating_key: 'rk2' }),
    ])
  })

  it('merges watchlist exclusions by key', async () => {
    const exclusions = await db('watchlist_exclusions').orderBy('key')
    expect(exclusions).toEqual([
      expect.objectContaining({ user_id: 2, key: 'ex-shared' }),
      expect.objectContaining({ user_id: 2, key: 'ex-solo' }),
    ])
  })

  it('enforces the unique name constraint after migrating', async () => {
    const error = await db('users')
      .insert({ name: 'alice' })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(error).toBeInstanceOf(Error)
    expect(isUniqueViolation(error)).toBe(true)
  })
})
