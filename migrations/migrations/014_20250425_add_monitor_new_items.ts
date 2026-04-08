import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '014_20250425_add_monitor_new_items')) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.string('monitor_new_items').defaultTo('all')
  })

  await knex('sonarr_instances')
    .whereNull('monitor_new_items')
    .update({ monitor_new_items: 'all' })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('monitor_new_items')
  })
}
