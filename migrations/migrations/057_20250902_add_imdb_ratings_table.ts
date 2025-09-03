import type { Knex } from 'knex'

/**
 * Creates the `imdb_ratings` table to store IMDB ratings data for content routing.
 *
 * The table includes columns for IMDB title IDs, average ratings, vote counts, and timestamps.
 * It enforces uniqueness on the `tconst` field and adds indexes to optimize rating and vote lookups.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('imdb_ratings', (table) => {
    table.increments('id').primary()
    table.string('tconst', 20).notNullable().unique() // IMDB ID like tt1234567
    table.decimal('average_rating', 3, 1) // 1.0-10.0 rating
    table.integer('num_votes') // Vote count
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    // Create indexes for fast lookups
    table.index(['average_rating'])
    table.index(['num_votes'])
  })
}

/**
 * Drops the `imdb_ratings` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('imdb_ratings')
}
