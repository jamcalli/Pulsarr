import type { Knex } from 'knex'

/**
 * Drops the imdb_ratings table and removes the imdb-update schedule.
 * The IMDB service has been deprecated in favor of using Plex ratings
 * stored directly on watchlist items.
 */
export async function up(knex: Knex): Promise<void> {
  // Delete the imdb-update schedule if it exists
  await knex('schedules').where('name', 'imdb-update').delete()

  // Drop the imdb_ratings table
  await knex.schema.dropTableIfExists('imdb_ratings')
}

/**
 * Recreates the imdb_ratings table.
 * Note: This will NOT restore the data or re-enable the schedule.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('imdb_ratings', (table) => {
    table.increments('id').primary()
    table.string('tconst', 20).notNullable().unique()
    table.decimal('average_rating', 3, 1)
    table.integer('num_votes')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['average_rating'])
    table.index(['num_votes'])
  })
}
