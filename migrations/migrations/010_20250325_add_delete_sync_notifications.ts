import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies a database migration that adds `deleteSyncNotify` and `maxDeletionPrevention` columns to the `configs` table.
 *
 * Adds the `deleteSyncNotify` column with a default value of `'none'` and the `maxDeletionPrevention` column with a default value of `10`. Updates existing rows where these columns are null to use the default values.
 *
 * @remark This migration is skipped for PostgreSQL databases.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '010_20250325_add_delete_sync_notifications')
  ) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.string('deleteSyncNotify').defaultTo('none')
    table.integer('maxDeletionPrevention').defaultTo(10)
  })

  await knex('configs')
    .whereNull('deleteSyncNotify')
    .update({ deleteSyncNotify: 'none' })

  await knex('configs')
    .whereNull('maxDeletionPrevention')
    .update({ maxDeletionPrevention: 10 })
}

/**
 * Reverts the migration by removing the `deleteSyncNotify` and `maxDeletionPrevention` columns from the `configs` table.
 *
 * @remark
 * This migration is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotify')
    table.dropColumn('maxDeletionPrevention')
  })
}
