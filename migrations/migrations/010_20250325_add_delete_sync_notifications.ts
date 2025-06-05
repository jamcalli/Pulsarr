import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '010_20250325_add_delete_sync_notifications')) {
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

export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotify')
    table.dropColumn('maxDeletionPrevention')
  })
}
