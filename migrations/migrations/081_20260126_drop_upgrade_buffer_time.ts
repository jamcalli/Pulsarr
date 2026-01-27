import type { Knex } from 'knex'

/**
 * Drops the `upgradeBufferTime` column from the `configs` table.
 *
 * @remarks
 * This column was used for upgrade tracking which has been removed.
 * Sonarr webhooks no longer trigger on upgrades (onUpgrade: false).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('upgradeBufferTime')
  })
}

/**
 * Reverts the migration by adding back the `upgradeBufferTime` column.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.integer('upgradeBufferTime').defaultTo(2000)
  })
}
