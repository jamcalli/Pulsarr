import type { Knex } from 'knex'

/**
 * Creates the `pending_label_syncs` table to track content items pending label synchronization.
 *
 * The table includes metadata for retries, expiration, and webhook tags, enforces uniqueness on `watchlist_item_id`, and references the `watchlist_items` table with cascade delete. Indexes are added to optimize synchronization queries.
 */
export async function up(knex: Knex): Promise<void> {
  // Detect Postgres to use jsonb and typed default
  const isPostgres = knex.client.config.client === 'pg'

  await knex.schema.createTable('pending_label_syncs', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.string('content_title', 255).notNullable() // Human readable title for logging

    if (isPostgres) {
      table
        .specificType('webhook_tags', 'jsonb')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"))
    } else {
      table.json('webhook_tags').notNullable().defaultTo('[]') // SQLite
    }

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
 * Drops the `pending_label_syncs` table from the database if it exists, reversing the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pending_label_syncs')
}
