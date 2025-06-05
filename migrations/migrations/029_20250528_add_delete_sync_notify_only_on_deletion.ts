import type { Knex } from 'knex'

/**
 * Adds the `deleteSyncNotifyOnlyOnDeletion` boolean column to the `configs` table with a default value of `false`.
 *
 * @param knex - The Knex schema builder instance.
 */
export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 029_20250528_add_delete_sync_notify_only_on_deletion - PostgreSQL uses consolidated schema in migration 034')
    return
  }
// Add deleteSyncNotifyOnlyOnDeletion to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncNotifyOnlyOnDeletion').defaultTo(false)
  })
}

/**
 * Reverts the migration by removing the `deleteSyncNotifyOnlyOnDeletion` column from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotifyOnlyOnDeletion')
  })
}