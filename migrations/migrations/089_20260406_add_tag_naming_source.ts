import type { Knex } from 'knex'

/**
 * Adds tagNamingSource column to configs table.
 *
 * Allows users to choose between Plex username or alias for arr tag naming.
 * Defaults to 'username' to preserve existing behavior.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('tagNamingSource').notNullable().defaultTo('username')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagNamingSource')
  })
}
