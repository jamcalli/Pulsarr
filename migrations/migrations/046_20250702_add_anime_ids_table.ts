import type { Knex } from 'knex'

/**
 * Creates the `anime_ids` table to store external identifiers for anime content.
 *
 * The table includes columns for an auto-incrementing primary key, external database ID, source of the ID, and timestamps. It enforces uniqueness on the combination of `external_id` and `source`, and adds indexes to optimize lookups.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('anime_ids', (table) => {
    table.increments('id').primary()
    table.string('external_id').notNullable()
    table.string('source').notNullable() // 'tvdb', 'imdb', 'tmdb', 'anidb'
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    // Create unique constraint on external_id + source combination
    table.unique(['external_id', 'source'])

    // Create indexes for fast lookups
    table.index(['external_id'])
    table.index(['source'])
  })
}

/**
 * Drops the `anime_ids` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('anime_ids')
}
