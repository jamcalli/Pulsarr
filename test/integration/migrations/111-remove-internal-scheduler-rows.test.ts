import type { Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createInMemoryDb, migrateThrough } from '../../helpers/migration-db.js'

const POLLERS = [
  'pending-webhooks-processor',
  'pending-webhooks-cleanup',
  'pending-label-sync-processor',
  'pending-label-sync-cleanup',
]

const RECONCILIATION = 'periodic-watchlist-reconciliation'
const LEFTOVER = 'imdb-update'

const intervalRow = (name: string) => ({
  name,
  type: 'interval',
  config: JSON.stringify({ seconds: 60 }),
  enabled: true,
})

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 111_remove_internal_scheduler_rows', () => {
  let db: Knex

  beforeAll(async () => {
    db = createInMemoryDb()
    await migrateThrough(db, '110')

    await db('schedules').insert([
      ...POLLERS.map(intervalRow),
      intervalRow(RECONCILIATION),
      intervalRow(LEFTOVER),
      intervalRow('quota-maintenance'),
    ])

    const [, files] = (await db.migrate.up()) as [number, string[]]
    expect(files[0]).toContain('111')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('deletes the four poller rows', async () => {
    expect(await db('schedules').whereIn('name', POLLERS)).toEqual([])
  })

  it('deletes the periodic reconciliation row', async () => {
    expect(await db('schedules').where('name', RECONCILIATION)).toEqual([])
  })

  it('deletes a leftover row for a job that no longer exists', async () => {
    expect(await db('schedules').where('name', LEFTOVER)).toEqual([])
  })

  it('keeps every other schedule row', async () => {
    const names = (await db('schedules').select('name')).map((row) => row.name)
    expect(names.sort()).toEqual(
      ['delete-sync', 'plex-rolling-auto-reset', 'quota-maintenance'].sort(),
    )
  })
})
