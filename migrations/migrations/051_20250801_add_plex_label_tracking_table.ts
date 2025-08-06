import type { Knex } from 'knex'

/**
 * Creates the `plex_label_tracking` table to track label synchronization between watchlist items and Plex content.
 *
 * The table maintains associations between watchlist items and their corresponding Plex content,
 * tracking all labels applied to each content item as a JSON array. This efficient approach stores
 * all labels for a given content item in a single row, reducing database overhead and improving
 * performance for content with multiple users and tags.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
    table.string('plex_rating_key', 50).notNullable()
    table.json('labels_applied').notNullable().defaultTo('[]')
    table.timestamp('synced_at').defaultTo(knex.fn.now())

    // Unique constraint - one tracking record per watchlist item/content pair
    table.unique(['watchlist_id', 'plex_rating_key'])

    // Indexes for efficient lookups
    table.index(['watchlist_id'])
    table.index(['plex_rating_key'])
    table.index(['synced_at'])
  })
}

/**
 * Drops the `plex_label_tracking` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('plex_label_tracking')
}
