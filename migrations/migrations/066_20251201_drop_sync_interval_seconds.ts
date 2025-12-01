import type { Knex } from 'knex'

/**
 * Removes the deprecated syncIntervalSeconds config column.
 *
 * This column was used for configuring RSS polling intervals. The RSS polling
 * mechanism has been replaced with ETag-based HEAD request polling which uses
 * a fixed 30-60s interval with jitter to spread load across Plex servers.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('syncIntervalSeconds')
  })
}

/**
 * Restores the syncIntervalSeconds column for rollback.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.integer('syncIntervalSeconds').defaultTo(10)
  })
}
