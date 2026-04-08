import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '020_20250506_add_minimum_availability')) {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.string('minimum_availability').defaultTo('released')
  })

  await knex('radarr_instances')
    .whereNull('minimum_availability')
    .update({ minimum_availability: 'released' })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('minimum_availability')
  })
}
