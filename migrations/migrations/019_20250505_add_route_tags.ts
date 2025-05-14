/**
 * Migration to add tags support to content router routes
 */
import type { Knex } from 'knex'

/**
 * Adds a "tags" JSON column to the "router_rules" table with a default value of an empty array.
 *
 * The new "tags" column allows each router rule to store an array of associated tags.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Adding a JSON column to store an array of tags
    table.json('tags').defaultTo('[]')
  })
}

/**
 * Drops the "tags" column from the "router_rules" table, reverting the schema to its previous state.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}