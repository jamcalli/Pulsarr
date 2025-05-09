/**
 * Migration to add tags support to content router routes
 */
import type { Knex } from 'knex'

/**
 * Alters the "router_rules" table by adding a "tags" JSON column with a default empty array.
 *
 * The "tags" column is intended to store an array of tags for each router rule.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Adding a JSON column to store an array of tags
    table.json('tags').defaultTo('[]')
  })
}

/**
 * Removes the "tags" column from the "router_rules" table to revert the schema change.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}