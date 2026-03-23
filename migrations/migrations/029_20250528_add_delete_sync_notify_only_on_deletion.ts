import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(
      knex,
      '029_20250528_add_delete_sync_notify_only_on_deletion',
    )
  ) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncNotifyOnlyOnDeletion').defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotifyOnlyOnDeletion')
  })
}
