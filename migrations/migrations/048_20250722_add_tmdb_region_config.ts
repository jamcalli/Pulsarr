import type { Knex } from 'knex'

/**
 * Adds the `tmdbRegion` column to the `configs` table to store the default region code for TMDB watch provider data.
 *
 * The new column is a string with a default value of `'US'`. The TMDB API key continues to be managed via environment variables and is not stored in the database.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('tmdbRegion').defaultTo('US')
  })
}

/**
 * Reverts the schema change by dropping the `tmdbRegion` column from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tmdbRegion')
  })
}
