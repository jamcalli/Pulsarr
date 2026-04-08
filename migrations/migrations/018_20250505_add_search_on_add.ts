import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '018_20250505_add_search_on_add')) {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.boolean('search_on_add').defaultTo(true)
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('search_on_add').defaultTo(true)
  })

  await knex('radarr_instances')
    .whereNull('search_on_add')
    .update({ search_on_add: true })

  await knex('sonarr_instances')
    .whereNull('search_on_add')
    .update({ search_on_add: true })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })
}
