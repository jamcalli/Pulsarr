import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const LEGACY_AUTOMATIC_URL = 'http://localhost:32400'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 103_plex_server_url_automatic', () => {
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
        throw new Error('Ran out of migrations before reaching 102')
      }
      applied = files
    } while (!applied[0]?.startsWith('102'))

    await db('configs').insert([
      { id: 1, plexServerUrl: LEGACY_AUTOMATIC_URL },
      { id: 2, plexServerUrl: 'https://plex.lan:32400' },
      { id: 3, plexServerUrl: 'http://localhost:32401' },
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('103')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const urls = async () =>
    (await db('configs').orderBy('id')).map(
      (row: { plexServerUrl: string | null }) => row.plexServerUrl,
    )

  it('rewrites the legacy localhost sentinel to automatic', async () => {
    expect(await urls()).toEqual([
      '',
      'https://plex.lan:32400',
      'http://localhost:32401',
    ])
  })

  it('defaults a new row to automatic', async () => {
    await db('configs').insert({ id: 4 })
    expect((await urls())[3]).toBe('')
    await db('configs').where({ id: 4 }).del()
  })

  it('restores the sentinel and its default on rollback', async () => {
    await db.migrate.down()
    expect(await urls()).toEqual([
      LEGACY_AUTOMATIC_URL,
      'https://plex.lan:32400',
      'http://localhost:32401',
    ])
    await db('configs').insert({ id: 4 })
    expect((await urls())[3]).toBe(LEGACY_AUTOMATIC_URL)
  })
})
