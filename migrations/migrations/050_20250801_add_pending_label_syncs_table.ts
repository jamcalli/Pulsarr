import type { Knex } from 'knex'

/**
 * Creates the `pending_label_syncs` table to track content waiting for label synchronization.
 *
 * The table references watchlist_item_id directly to enable efficient Plex key lookup,
 * eliminating the need for GUID-based searching. Includes retry tracking and expiration
 * management with foreign key constraints for data integrity. Also stores webhook tags
 * to ensure they are preserved during pending processing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pending_label_syncs', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.string('content_title', 255).notNullable() // Human readable title for logging
    table.json('webhook_tags').notNullable().defaultTo('[]') // Store webhook tags as JSON array
    table.integer('retry_count').defaultTo(0)
    table.timestamp('last_retry_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('expires_at').notNullable()

    // Add unique constraint to prevent duplicate pending syncs for same watchlist item
    table.unique(['watchlist_item_id'])

    // Add index for faster lookups during sync operations
    table.index(['watchlist_item_id'])
    table.index(['expires_at'])
  })
}

/**
 * Drops the `pending_label_syncs` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pending_label_syncs')
}
