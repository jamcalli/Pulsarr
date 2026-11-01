import type { Knex } from 'knex'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfigFixture } from '../../helpers/config-fixtures.js'
import { readConfigSettings } from '../../helpers/config-settings.js'
import { createInMemoryDb, migrateThrough } from '../../helpers/migration-db.js'

const SEEDED_ROW = loadConfigFixture('seeded').row

const NOT_NULL_VALUES = {
  tagNamingSource: 'alias',
  notifyOnUpdate: 'all',
  watchlistAddNotify: 'none',
  notifyOnAvailability: false,
  maintainerrEnabled: true,
  maintainerrExclusionMode: 'global',
  plexExistenceScope: 'owned',
}

async function columnNames(db: Knex): Promise<string[]> {
  return Object.keys(await db('configs').columnInfo()).sort()
}

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 109_config_json_store', () => {
  let db: Knex

  afterEach(async () => {
    await db.destroy()
  })

  it('moves a legacy row into the settings document', async () => {
    db = createInMemoryDb()
    await migrateThrough(db, '108')
    await db('configs').insert({
      ...SEEDED_ROW,
      lastNotifiedVersion: '1.0.0',
      webhookSecret: 'stored-webhook-secret',
      skipFriendSync: 1,
      newUserDefaultMovieWatchlistCap: 0,
      ...NOT_NULL_VALUES,
    })

    await db.migrate.up()

    expect(await columnNames(db)).toEqual([
      'created_at',
      'id',
      'settings',
      'updated_at',
    ])
    const settings = await readConfigSettings(db)
    expect(settings.port).toBe(3004)
    expect(settings.skipFriendSync).toBe(true)
    expect(settings.newUserDefaultMovieWatchlistCap).toBe(0)
    expect(settings.plexTokens).toEqual(['test_plex_token_1234567890'])
    expect(settings.quotaSettings?.cleanup.enabled).toBe(false)
    expect(settings.cookieSecret).toBe(SEEDED_ROW.cookieSecret)
    expect(settings.webhookSecret).toBe('stored-webhook-secret')
    expect(settings.lastNotifiedVersion).toBe('1.0.0')
    expect(settings).toMatchObject(NOT_NULL_VALUES)
    expect(settings).not.toHaveProperty('dbPath')
    expect(settings).not.toHaveProperty('cookieName')
    expect(settings).not.toHaveProperty('discordWebhookUrl')
  })

  it('migrates a fresh database with no config row', async () => {
    db = createInMemoryDb()
    await migrateThrough(db, '108')

    await db.migrate.up()

    expect(await db('configs')).toHaveLength(0)
    expect(await columnNames(db)).toEqual([
      'created_at',
      'id',
      'settings',
      'updated_at',
    ])
    await db('configs').insert({ id: 1 })
    expect((await db('configs').first()).settings).toBe('{}')
  })

  it('refuses to roll back', async () => {
    db = createInMemoryDb()
    await migrateThrough(db, '109')

    await expect(db.migrate.down()).rejects.toThrow(/Irreversible/)
  })
})
