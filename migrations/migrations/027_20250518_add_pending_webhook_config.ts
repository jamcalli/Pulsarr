import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '027_20250518_add_pending_webhook_config')
  ) {
    return
  }
  const configsExists = await knex.schema.hasTable('configs')

  if (configsExists) {
    const columnsToAdd = {
      pendingWebhookRetryInterval: { type: 'integer', defaultValue: 20 },
      pendingWebhookMaxAge: { type: 'integer', defaultValue: 10 },
      pendingWebhookCleanupInterval: { type: 'integer', defaultValue: 60 },
    }

    for (const [columnName, config] of Object.entries(columnsToAdd)) {
      const columnExists = await knex.schema.hasColumn('configs', columnName)

      if (!columnExists) {
        await knex.schema.alterTable('configs', (table) => {
          table.integer(columnName).defaultTo(config.defaultValue)
        })

        await knex('configs')
          .whereNull(columnName)
          .update({ [columnName]: config.defaultValue })
      }
    }
  }
}

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
