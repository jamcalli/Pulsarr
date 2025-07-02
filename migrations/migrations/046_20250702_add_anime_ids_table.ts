import type { Knex } from 'knex'

/**
 * Creates the `anime_ids` table for anime content identification.
 *
 * This table stores external database IDs (TVDB, IMDB, TMDB, AniDB) that identify anime content,
 * allowing the content router to determine if media is anime-related.
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
    table.index(['external_id', 'source'])
  })
}

/**
 * Drops the `anime_ids` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('anime_ids')
}
