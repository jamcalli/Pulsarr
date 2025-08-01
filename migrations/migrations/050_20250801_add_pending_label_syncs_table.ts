import type { Knex } from 'knex'

/**
 * Creates the `pending_label_syncs` table to track content waiting for label synchronization.
 *
 * The table includes columns for content identification (guid), human-readable title,
 * retry tracking, and expiration management. Includes an index on the guid column for
 * optimized lookups during sync operations.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pending_label_syncs', (table) => {
    table.increments('id').primary()
    table.string('guid', 255).notNullable() // Content identifier like 'tmdb:123456'
    table.string('content_title', 255).notNullable() // Human readable title
    table.integer('retry_count').defaultTo(0)
    table.timestamp('last_retry_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('expires_at').notNullable()

    // Add index on guid for faster lookups during sync operations
    table.index(['guid'])
  })
}

/**
 * Drops the `pending_label_syncs` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pending_label_syncs')
}
