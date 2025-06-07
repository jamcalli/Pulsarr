import type { Knex } from 'knex'

export const POSTGRESQL_CLIENT = 'pg' as const
export const SQLITE_CLIENT = 'better-sqlite3' as const

/**
 * Determines whether a migration should be skipped for PostgreSQL databases.
 *
 * Skips migrations for PostgreSQL if the database client is PostgreSQL, as migrations 001-033 are consolidated into migration 034 for PostgreSQL.
 *
 * @param migrationName - The name of the migration, used for logging when a migration is skipped.
 * @returns `true` if the migration should be skipped for PostgreSQL; otherwise, `false`.
 */
export function shouldSkipForPostgreSQL(
  knex: Knex,
  migrationName: string,
): boolean {
  const client = knex.client.config?.client
  if (client === POSTGRESQL_CLIENT) {
    console.log(
      `Skipping migration ${migrationName} - PostgreSQL uses consolidated schema in migration 034`,
    )
    return true
  }
  return false
}

/**
 * Determines whether a down migration should be skipped for PostgreSQL databases.
 *
 * @returns `true` if the current database client is PostgreSQL; otherwise, `false`.
 */
export function shouldSkipDownForPostgreSQL(knex: Knex): boolean {
  const client = knex.client.config?.client
  return client === POSTGRESQL_CLIENT
}

/**
 * Returns the database client type string from the given Knex instance.
 *
 * @returns The client type identifier (e.g., 'pg', 'better-sqlite3'), or 'unknown' if not defined.
 */
export function getDatabaseClient(knex: Knex): string {
  return knex.client.config?.client || 'unknown'
}

/**
 * Determines whether the current database client is PostgreSQL.
 *
 * @returns `true` if the Knex instance is configured for PostgreSQL; otherwise, `false`.
 */
export function isPostgreSQL(knex: Knex): boolean {
  return getDatabaseClient(knex) === POSTGRESQL_CLIENT
}

/**
 * Determines whether the current database client is SQLite.
 *
 * @returns `true` if the Knex instance is connected to a SQLite database; otherwise, `false`.
 */
export function isSQLite(knex: Knex): boolean {
  return getDatabaseClient(knex) === SQLITE_CLIENT
}
