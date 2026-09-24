import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB: the shared test singleton is already migrated to latest
describe('migration 100_fix_anime_imdb_canonical', () => {
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
        throw new Error('Ran out of migrations before reaching 099')
      }
      applied = files
    } while (!applied[0]?.startsWith('099'))

    await db('anime_ids').insert([
      { external_id: '0094625', source: 'imdb' },
      { external_id: 'tt0000001', source: 'imdb' },
      { external_id: '81189', source: 'tvdb' },
      { external_id: '13579', source: 'tmdb' },
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('100')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const idsFor = async (source: string) =>
    (await db('anime_ids').where({ source }).orderBy('external_id')).map(
      (row: { external_id: string }) => row.external_id,
    )

  it('prefixes padded imdb ids and leaves canonical ones alone', async () => {
    expect(await idsFor('imdb')).toEqual(['tt0000001', 'tt0094625'])
  })

  it('leaves tvdb and tmdb rows untouched', async () => {
    expect(await idsFor('tvdb')).toEqual(['81189'])
    expect(await idsFor('tmdb')).toEqual(['13579'])
    expect(await db('anime_ids')).toHaveLength(4)
  })

  it('strips the prefix from imdb ids on rollback', async () => {
    await db.migrate.down()
    expect(await idsFor('imdb')).toEqual(['0000001', '0094625'])
    expect(await idsFor('tvdb')).toEqual(['81189'])
  })
})
