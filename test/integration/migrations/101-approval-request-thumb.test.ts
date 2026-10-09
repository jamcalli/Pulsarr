import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 101_add_approval_request_thumb', () => {
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
        throw new Error('Ran out of migrations before reaching 100')
      }
      applied = files
    } while (!applied[0]?.startsWith('100'))

    await db('users').insert([
      { id: 1, name: 'requester' },
      { id: 2, name: 'other' },
    ])

    await db('watchlist_items').insert([
      { user_id: 2, key: 'own', title: 'Own', type: 'movie', thumb: '/a.jpg' },
      { user_id: 1, key: 'own', title: 'Own', type: 'movie', thumb: '/b.jpg' },
      {
        user_id: 2,
        key: 'gone',
        title: 'Gone',
        type: 'movie',
        thumb: '/c.jpg',
      },
      { user_id: 1, key: 'blank', title: 'Blank', type: 'movie', thumb: null },
      {
        user_id: 2,
        key: 'blank',
        title: 'Blank',
        type: 'movie',
        thumb: '/d.jpg',
      },
    ])

    await db('approval_requests').insert(
      ['own', 'gone', 'blank', 'orphan'].map((key) => ({
        user_id: 1,
        content_type: 'movie',
        content_title: key,
        content_key: key,
        router_decision: '{}',
        triggered_by: 'quota_exceeded',
      })),
    )

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('101')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const thumbFor = async (key: string) =>
    (await db('approval_requests').where({ content_key: key }).first())?.thumb

  it('prefers the requester watchlist poster', async () => {
    expect(await thumbFor('own')).toBe('/b.jpg')
  })

  it('falls back to another user poster when the requester row is gone', async () => {
    expect(await thumbFor('gone')).toBe('/c.jpg')
  })

  it('skips a null requester poster for another user poster', async () => {
    expect(await thumbFor('blank')).toBe('/d.jpg')
  })

  it('leaves records with no matching watchlist row null', async () => {
    expect(await thumbFor('orphan')).toBeNull()
  })

  it('drops the column on rollback', async () => {
    await db.migrate.down()
    expect(await db.schema.hasColumn('approval_requests', 'thumb')).toBe(false)
    expect(await db('approval_requests')).toHaveLength(4)
  })
})
