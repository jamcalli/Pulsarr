import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds the `deleteSyncNotifyOnlyOnDeletion` boolean column to the `configs` table with a default value of `false`.
 *
 * The migration is skipped for PostgreSQL databases.
 *
 * @remark
 * This operation does not run on PostgreSQL clients; see {@link shouldSkipForPostgreSQL}.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(
      knex,
      '029_20250528_add_delete_sync_notify_only_on_deletion',
    )
  ) {
    return
  }
  // Add deleteSyncNotifyOnlyOnDeletion to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncNotifyOnlyOnDeletion').defaultTo(false)
  })
}

/**
 * Removes the `deleteSyncNotifyOnlyOnDeletion` column from the `configs` table if the migration is not skipped for PostgreSQL databases.
 *
 * @remark
 * The operation is skipped if {@link shouldSkipDownForPostgreSQL} returns true for the provided Knex instance.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotifyOnlyOnDeletion')
  })
}
