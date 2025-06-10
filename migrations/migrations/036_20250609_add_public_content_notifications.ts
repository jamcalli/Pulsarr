import type { Knex } from 'knex'

/**
 * Adds a nullable JSON column named `publicContentNotifications` to the `configs` table.
 *
 * This column enables support for broadcasting all content availability to public Discord channels and shared Apprise endpoints.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('publicContentNotifications').nullable()
  })
}

/**
 * Reverts the migration by dropping the `publicContentNotifications` column from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('publicContentNotifications')
  })
}
