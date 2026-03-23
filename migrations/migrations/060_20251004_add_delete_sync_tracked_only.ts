import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncTrackedOnly').defaultTo(false)
    table.boolean('deleteSyncCleanupApprovals').defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncTrackedOnly')
    table.dropColumn('deleteSyncCleanupApprovals')
  })
}
