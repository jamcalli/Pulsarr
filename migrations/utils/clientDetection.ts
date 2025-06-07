import type { Knex } from 'knex'

export const POSTGRESQL_CLIENT = 'pg' as const
export const SQLITE_CLIENT = 'better-sqlite3' as const

/**
 * Checks if the current migration should be skipped for PostgreSQL databases
 *
 * PostgreSQL uses a consolidated schema in migration 034 that includes all
 * previous SQLite migrations (001-033), so those migrations should be skipped.
 *
 * @param knex - Knex instance
 * @param migrationName - Name of the migration for logging purposes
 * @returns true if the migration should be skipped, false otherwise
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
 * Checks if the current migration should be skipped for PostgreSQL databases (down migration)
 *
 * @param knex - Knex instance
 * @returns true if the migration should be skipped, false otherwise
 */
export function shouldSkipDownForPostgreSQL(knex: Knex): boolean {
  const client = knex.client.config?.client
  return client === POSTGRESQL_CLIENT
}

/**
 * Gets the current database client type
 *
 * @param knex - Knex instance
 * @returns The client type ('pg', 'better-sqlite3', etc.)
 */
export function getDatabaseClient(knex: Knex): string {
  return knex.client.config?.client || 'unknown'
}

/**
 * Checks if the current database is PostgreSQL
 *
 * @param knex - Knex instance
 * @returns true if PostgreSQL, false otherwise
 */
export function isPostgreSQL(knex: Knex): boolean {
  return getDatabaseClient(knex) === POSTGRESQL_CLIENT
}

/**
 * Checks if the current database is SQLite
 *
 * @param knex - Knex instance
 * @returns true if SQLite, false otherwise
 */
export function isSQLite(knex: Knex): boolean {
  return getDatabaseClient(knex) === SQLITE_CLIENT
}
