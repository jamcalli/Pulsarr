import type { Knex } from 'knex'

/**
 * Adds nullable JSON column `plexLabelSync` to the `configs` table.
 *
 * This column is used to store configuration data for Plex label synchronization, following
 * the same pattern as other complex config objects like plexSessionMonitoring, quotaSettings, etc.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    // Plex label sync configuration
    table.json('plexLabelSync').nullable()
  })
}

/**
 * Removes the `plexLabelSync` column from the `configs` table to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('plexLabelSync')
  })
}
