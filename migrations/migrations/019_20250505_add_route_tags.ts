/**
 * Migration to add tags support to content router routes
 */
import type { Knex } from 'knex'

/**
 * Adds the tags field to router_rules table
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Adding a JSON column to store an array of tags
    table.json('tags').defaultTo('[]')
  })
}

/**
 * Removes tags field from router_rules table
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('tags')
  })
}