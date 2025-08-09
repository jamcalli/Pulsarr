import type { Knex } from 'knex'

/**
 * Adds a nullable JSON column `plexLabelSync` to the `configs` table to store Plex label synchronization configuration.
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
