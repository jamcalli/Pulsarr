import type { Knex } from 'knex'

export const POSTGRESQL_CLIENT = 'pg' as const
export const SQLITE_CLIENT = 'better-sqlite3' as const

// Migrations 001-033 are consolidated into 034 for PostgreSQL
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

export function shouldSkipDownForPostgreSQL(knex: Knex): boolean {
  const client = knex.client.config?.client
  return client === POSTGRESQL_CLIENT
}

export function getDatabaseClient(knex: Knex): string {
  return knex.client.config?.client || 'unknown'
}

export function isPostgreSQL(knex: Knex): boolean {
  return getDatabaseClient(knex) === POSTGRESQL_CLIENT
}

export function isSQLite(knex: Knex): boolean {
  return getDatabaseClient(knex) === SQLITE_CLIENT
}
