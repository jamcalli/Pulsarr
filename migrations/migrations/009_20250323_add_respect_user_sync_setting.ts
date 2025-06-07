import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

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

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('respectUserSyncSetting')
    table.integer('deleteIntervalDays')
  })
}
