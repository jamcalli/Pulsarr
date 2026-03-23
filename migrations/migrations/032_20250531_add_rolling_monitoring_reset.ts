import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '032_20250531_add_rolling_monitoring_reset')
  ) {
    return
  }
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').nullable()
  })

  // Backfill existing rows before making the column NOT NULL
  await knex('rolling_monitored_shows').update({
    last_updated_at: knex.ref('updated_at'),
  })

  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').notNullable().alter()
    table.index('last_updated_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropIndex('last_updated_at')
    table.dropColumn('last_updated_at')
  })
}
