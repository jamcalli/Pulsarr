import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '019_20250505_add_route_tags')) {
    return
  }
  await knex.schema.alterTable('router_rules', (table) => {
    table.json('tags').defaultTo('[]')
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}
