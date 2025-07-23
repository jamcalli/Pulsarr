import type { Knex } from 'knex'

/**
 * Adds tmdbRegion configuration field to the configs table.
 *
 * The tmdbRegion field stores the default region code for TMDB watch provider data.
 * Defaults to 'US' for United States. The TMDB API key remains environment-only
 * and is not stored in the database.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('tmdbRegion').defaultTo('US')
  })
}

/**
 * Removes the tmdbRegion configuration field from the configs table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tmdbRegion')
  })
}
