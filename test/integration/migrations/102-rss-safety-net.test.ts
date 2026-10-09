import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 102_add_rss_safety_net', () => {
  let db: Knex

  beforeAll(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      migrations: { directory: './migrations/migrations' },
      pool: { min: 1, max: 1 },
    })

    let applied: string[]
    do {
      const [, files] = (await db.migrate.up()) as [number, string[]]
      if (files.length === 0) {
        throw new Error('Ran out of migrations before reaching 101')
      }
      applied = files
    } while (!applied[0]?.startsWith('101'))

    await db('configs').insert({ id: 1 })

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('102')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('leaves existing installs with the safety net off at a 30-minute interval', async () => {
    const row = await db('configs').where({ id: 1 }).first()
    expect(Boolean(row.rssSafetyNetEnabled)).toBe(false)
    expect(row.rssSafetyNetIntervalMinutes).toBe(30)
  })

  it('drops both columns on rollback', async () => {
    await db.migrate.down()

    expect(await db.schema.hasColumn('configs', 'rssSafetyNetEnabled')).toBe(
      false,
    )
    expect(
      await db.schema.hasColumn('configs', 'rssSafetyNetIntervalMinutes'),
    ).toBe(false)
    expect(await db('configs').where({ id: 1 }).first()).toBeDefined()
  })
})
