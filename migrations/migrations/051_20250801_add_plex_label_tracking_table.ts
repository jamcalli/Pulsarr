import type { Knex } from 'knex'

/**
 * Creates the `plex_label_tracking` table to track label synchronization between users and Plex content.
 *
 * The table maintains associations between users and their labeled Plex content, tracking all
 * labels applied to each content item as a JSON array. Uses full GUID arrays for proper matching
 * and content type for disambiguation. This content-based approach allows watchlist items to be
 * deleted without affecting label tracking, supporting "keep" mode where labels persist even
 * after users remove content from their watchlist.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()

    // Track by content GUIDs + user instead of watchlist_id to avoid FK constraints
    table.json('content_guids').notNullable() // Full GUID array for proper matching
    table.string('content_type', 10).notNullable() // 'movie' or 'show' for disambiguation
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE') // When user deleted, remove their label tracking

    table.string('plex_rating_key', 50).notNullable()
    table.json('labels_applied').notNullable().defaultTo('[]')
    table.timestamp('synced_at').defaultTo(knex.fn.now())

    // Unique constraint - one tracking record per content/user/rating_key combo
    table.unique(['content_guids', 'user_id', 'plex_rating_key'])

    // Indexes for efficient lookups
    table.index(['user_id'])
    table.index(['plex_rating_key'])
    table.index(['synced_at'])
    table.index(['content_type'])
  })
}

/**
 * Drops the `plex_label_tracking` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('plex_label_tracking')
}
