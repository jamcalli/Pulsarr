import type { Knex } from 'knex'

/**
 * Adds a nullable JSON column named `publicContentNotifications` to the `configs` table.
 *
 * This column is used to store data for broadcasting content availability to public Discord channels and shared Apprise endpoints.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('publicContentNotifications').nullable()
  })
}

/**
 * Drops the `publicContentNotifications` column from the `configs` table to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('publicContentNotifications')
  })
}
