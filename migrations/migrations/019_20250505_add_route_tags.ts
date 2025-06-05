import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Migration to add tags support to content router routes
 */

/**
 * Adds a "tags" JSON column to the "router_rules" table with a default value of an empty array.
 *
 * The new "tags" column allows each router rule to store an array of associated tags.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '019_20250505_add_route_tags')) {
    return
  }
await knex.schema.alterTable('router_rules', (table) => {
    // Adding a JSON column to store an array of tags
    table.json('tags').defaultTo('[]')
  })
}

/**
 * Drops the "tags" column from the "router_rules" table, reverting the schema to its previous state.
 */
export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}
