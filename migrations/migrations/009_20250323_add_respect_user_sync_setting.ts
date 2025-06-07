import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies a database migration to update the `configs` table schema and data.
 *
 * Adds a `respectUserSyncSetting` boolean column with a default value of `true`, removes the `deleteIntervalDays` column, and ensures all existing rows have `respectUserSyncSetting` set to `true` if previously null. Skips execution for PostgreSQL databases based on utility logic.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '009_20250323_add_respect_user_sync_setting')
  ) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('respectUserSyncSetting').defaultTo(true)
    table.dropColumn('deleteIntervalDays')
  })

  await knex('configs')
    .whereNull('respectUserSyncSetting')
    .update({ respectUserSyncSetting: true })
}

/**
 * Reverts the migration by removing the `respectUserSyncSetting` column and restoring the `deleteIntervalDays` column in the `configs` table.
 *
 * @remark
 * This migration is skipped for PostgreSQL databases based on {@link shouldSkipDownForPostgreSQL}.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('respectUserSyncSetting')
    table.integer('deleteIntervalDays')
  })
}
