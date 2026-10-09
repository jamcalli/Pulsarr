import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated in-memory DB because the shared test singleton is already migrated to latest
describe('migration 102_add_notification_delivery_schedule', () => {
  let db: Knex

  const migrateTo = async (prefix: string) => {
    let applied: string[]
    do {
      const [, files] = (await db.migrate.up()) as [number, string[]]
      if (files.length === 0) {
        throw new Error(`Ran out of migrations before reaching ${prefix}`)
      }
      applied = files
    } while (!applied[0]?.startsWith(prefix))
  }

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

    await migrateTo('101')
    await db('users').insert({ id: 1, name: 'existing', notify_discord: true })
    await migrateTo('102')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('leaves existing users inheriting every default', async () => {
    const user = await db('users').where({ id: 1 }).first()
    expect(user).toMatchObject({
      notify_digest_mode: null,
      notify_digest_window_minutes: null,
      notify_digest_time: null,
      notify_quiet_hours_enabled: null,
      notify_quiet_hours_start: null,
      notify_quiet_hours_end: null,
      notify_timezone: null,
    })
  })

  it('creates held_notifications with a cascading user FK', async () => {
    await db('held_notifications').insert({
      user_id: 1,
      media_type: 'show',
      guid: 'tvdb:1',
      title: 'Show X',
      notification: JSON.stringify({ type: 'show', title: 'Show X' }),
      reason: 'digest',
      deliver_after: '2027-01-01T00:00:00.000Z',
    })
    const [row] = await db('held_notifications').select('*')
    expect(row.episodes).toBe('[]')
    expect(row.claimed_at).toBeNull()
    expect(Boolean(row.is_bulk_release)).toBe(false)

    await db('users').where({ id: 1 }).delete()
    expect(await db('held_notifications').select('*')).toHaveLength(0)
  })

  it('rejects unknown reasons', async () => {
    await db('users').insert({ id: 2, name: 'other' })
    await expect(
      db('held_notifications').insert({
        user_id: 2,
        media_type: 'movie',
        guid: 'tmdb:1',
        title: 'Movie',
        notification: '{}',
        reason: 'whenever',
        deliver_after: '2027-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow()
  })

  it('rolls back cleanly', async () => {
    await db.migrate.down()

    expect(await db.schema.hasTable('held_notifications')).toBe(false)
    expect(await db.schema.hasColumn('users', 'notify_timezone')).toBe(false)
    expect(await db.schema.hasColumn('configs', 'notificationDelivery')).toBe(
      false,
    )
    expect(await db('users').where({ id: 2 }).first()).toBeDefined()
  })
})
