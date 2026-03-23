import type { Knex } from 'knex'

/**
 * Sonarr webhooks no longer trigger on upgrades (onUpgrade: false),
 * so this config column is unused.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('upgradeBufferTime')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.integer('upgradeBufferTime').defaultTo(2000)
  })
}
