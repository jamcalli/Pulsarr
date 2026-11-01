import type { Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createInMemoryDb, migrateThrough } from '../../helpers/migration-db.js'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 106_add_plex_existence_scope', () => {
  let db: Knex

  beforeAll(async () => {
    db = createInMemoryDb()
    await migrateThrough(db, '105')

    await db('configs').insert({ id: 1 })

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('106')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('gives an existing config the owned and shared scope', async () => {
    const row = await db('configs').where({ id: 1 }).first()
    expect(row?.plexExistenceScope).toBe('owned-and-shared')
  })

  it('drops the column on rollback', async () => {
    await db.migrate.down()
    expect(await db.schema.hasColumn('configs', 'plexExistenceScope')).toBe(
      false,
    )
    expect(await db('configs')).toHaveLength(1)
  })
})
