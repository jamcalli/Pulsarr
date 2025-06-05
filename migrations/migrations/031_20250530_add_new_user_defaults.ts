import type { Knex } from 'knex'

/**
 * Adds a `newUserDefaultCanSync` boolean column to the `configs` table with a default value of `true`.
 *
 * @param knex - The Knex instance for schema modification.
 */
export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 031_20250530_add_new_user_defaults - PostgreSQL uses consolidated schema in migration 034')
    return
  }
await knex.schema.alterTable('configs', (table) => {
    table.boolean('newUserDefaultCanSync').defaultTo(true)
  })
}

/**
 * Drops the `newUserDefaultCanSync` column from the `configs` table, reverting the schema change introduced by the migration.
 */
export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('newUserDefaultCanSync')
  })
}