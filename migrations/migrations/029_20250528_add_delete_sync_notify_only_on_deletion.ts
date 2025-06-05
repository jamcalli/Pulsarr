import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds the `deleteSyncNotifyOnlyOnDeletion` boolean column to the `configs` table with a default value of `false`.
 *
 * @param knex - The Knex schema builder instance.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '029_20250528_add_delete_sync_notify_only_on_deletion')) {
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
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotifyOnlyOnDeletion')
  })
}