import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 104_add_rolling_season_episode_counts', () => {
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
        throw new Error('Ran out of migrations before reaching 103')
      }
      applied = files
    } while (!applied[0]?.startsWith('103'))

    await db('sonarr_instances').insert({
      id: 1,
      name: 'Sonarr',
      base_url: 'http://sonarr',
      api_key: 'key',
    })
    const now = new Date().toISOString()
    await db('rolling_monitored_shows').insert({
      sonarr_series_id: 10,
      sonarr_instance_id: 1,
      tvdb_id: '90210',
      show_title: 'Stella',
      monitoring_type: 'firstSeasonRolling',
      current_monitored_season: 1,
      last_watched_season: 0,
      last_watched_episode: 0,
      created_at: now,
      updated_at: now,
      last_updated_at: now,
    })

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('104')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('leaves existing shows without counts', async () => {
    const row = await db('rolling_monitored_shows').first()
    expect(row.season_episode_counts).toBeNull()
  })

  it('stores a season map', async () => {
    await db('rolling_monitored_shows').update({
      season_episode_counts: JSON.stringify({ 1: 9, 2: 10 }),
    })
    const row = await db('rolling_monitored_shows').first()
    expect(JSON.parse(row.season_episode_counts)).toEqual({ 1: 9, 2: 10 })
  })

  it('drops the column and keeps the show on rollback', async () => {
    await db.migrate.down()
    const rows = await db('rolling_monitored_shows')
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('season_episode_counts')
  })
})
