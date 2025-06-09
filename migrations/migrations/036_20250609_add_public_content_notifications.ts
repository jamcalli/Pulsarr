import type { Knex } from 'knex'

/**
 * Adds the publicContentNotifications column to the configs table to support
 * broadcasting ALL content availability to public Discord channels and shared Apprise endpoints.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('publicContentNotifications').nullable()
  })
}

/**
 * Removes the publicContentNotifications column from the configs table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('publicContentNotifications')
  })
}
