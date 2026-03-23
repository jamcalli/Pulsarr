import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '025_20250514_add_series_type_to_sonarr')) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.string('series_type').defaultTo('standard')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.string('series_type').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('series_type')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('series_type')
  })
}
