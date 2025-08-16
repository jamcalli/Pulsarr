import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds pending webhook configuration columns to the `configs` table if they do not already exist.
 *
 * Adds `pendingWebhookRetryInterval`, `pendingWebhookMaxAge`, and `pendingWebhookCleanupInterval` as integer columns with default values of 20, 10, and 60, respectively. Updates existing rows with `NULL` values for these columns to the default values.
 *
 * @remark
 * No changes are made if the `configs` table does not exist, if the columns are already present, or if the migration is skipped for PostgreSQL.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '027_20250518_add_pending_webhook_config')
  ) {
    return
  }
  // Check if the configs table exists
  const configsExists = await knex.schema.hasTable('configs')

  if (configsExists) {
    const columnsToAdd = {
      pendingWebhookRetryInterval: { type: 'integer', defaultValue: 20 },
      pendingWebhookMaxAge: { type: 'integer', defaultValue: 10 },
      pendingWebhookCleanupInterval: { type: 'integer', defaultValue: 60 },
    }

    // Check and add each column if it doesn't exist
    for (const [columnName, config] of Object.entries(columnsToAdd)) {
      const columnExists = await knex.schema.hasColumn('configs', columnName)

      if (!columnExists) {
        await knex.schema.alterTable('configs', (table) => {
          table.integer(columnName).defaultTo(config.defaultValue)
        })

        // Set default values for existing rows
        await knex('configs')
          .whereNull(columnName)
          .update({ [columnName]: config.defaultValue })
      }
    }
  }
}

/**
 * Removes the pending webhook configuration columns from the `configs` table if they exist.
 *
 * Drops the `pendingWebhookRetryInterval`, `pendingWebhookMaxAge`, and `pendingWebhookCleanupInterval` columns from the `configs` table, only if the table and columns are present.
 *
 * @remark No action is taken if the migration is skipped for PostgreSQL, or if the table or columns do not exist.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  const configsExists = await knex.schema.hasTable('configs')

  if (configsExists) {
    const columnsToDrop = [
      'pendingWebhookRetryInterval',
      'pendingWebhookMaxAge',
      'pendingWebhookCleanupInterval',
    ]

    for (const columnName of columnsToDrop) {
      const columnExists = await knex.schema.hasColumn('configs', columnName)

      if (columnExists) {
        await knex.schema.alterTable('configs', (table) => {
          table.dropColumn(columnName)
        })
      }
    }
  }
}
