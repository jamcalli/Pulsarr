import knex, { type Knex } from 'knex'

/** A fresh in-memory SQLite database with no migrations applied. */
export function createInMemoryDb(): Knex {
  return knex({
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
}

/** Applies migrations one at a time up to and including the one whose name starts with `prefix`. */
export async function migrateThrough(db: Knex, prefix: string): Promise<void> {
  let applied: string[]
  do {
    const [, files] = (await db.migrate.up()) as [number, string[]]
    if (files.length === 0) {
      throw new Error(`Ran out of migrations before reaching ${prefix}`)
    }
    applied = files
  } while (!applied[0]?.startsWith(prefix))
}
