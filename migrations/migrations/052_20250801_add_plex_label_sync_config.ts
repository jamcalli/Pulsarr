import type { Knex } from 'knex'

/**
 * Adds a nullable JSON column named `plexLabelSync` to the `configs` table.
 *
 * This column is intended to store configuration data for Plex label synchronization.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    // Plex label sync configuration
    table.json('plexLabelSync').nullable()
  })
}

/**
 * Drops the `plexLabelSync` column from the `configs` table, reverting the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('plexLabelSync')
  })
}
