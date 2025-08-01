import type { Knex } from 'knex'

/**
 * Creates the `plex_label_tracking` table to track label synchronization between watchlist items and Plex content.
 *
 * The table maintains associations between watchlist items and their corresponding Plex content,
 * tracking which labels have been applied and when they were last synchronized. Includes a unique
 * constraint to prevent duplicate tracking entries and a foreign key relationship with cascade
 * deletion to maintain data integrity.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.string('plex_rating_key', 50).notNullable()
    table.string('label_applied', 255).notNullable()
    table.timestamp('synced_at').defaultTo(knex.fn.now())

    // Unique constraint to prevent duplicate tracking entries
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
