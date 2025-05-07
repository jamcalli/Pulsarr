/**
 * Migration to add tags support to content router routes
 */
import type { Knex } from 'knex'

/**
 * Adds a JSON column named "tags" to the "router_rules" table for storing an array of tags.
 *
 * The new "tags" column defaults to an empty array.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Adding a JSON column to store an array of tags
    table.json('tags').defaultTo('[]')
  })
}

/**
 * Drops the "tags" column from the "router_rules" table, reverting the schema change introduced by the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}