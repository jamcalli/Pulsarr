import type { Knex } from 'knex'

/**
 * Adds a nullable JSON column `publicContentNotifications` to the `configs` table.
 *
 * This column enables broadcasting content availability to public Discord channels and shared Apprise endpoints.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('publicContentNotifications').nullable()
  })
}

/**
 * Removes the `publicContentNotifications` column from the `configs` table, reverting the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('publicContentNotifications')
  })
}
