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
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  // Create content_type enum for PostgreSQL if it doesn't exist
  if (isPostgres) {
    await knex.raw(`
      CREATE TYPE IF NOT EXISTS plex_content_type AS ENUM ('movie', 'show');
    `)
  }

  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()

    // Track by content GUIDs + user instead of watchlist_id to avoid FK constraints
    table.json('content_guids').notNullable() // Full GUID array for proper matching

    // Constrain content_type to only allow 'movie' or 'show'
    if (isPostgres) {
      table.specificType('content_type', 'plex_content_type').notNullable()
    } else {
      table.enum('content_type', ['movie', 'show']).notNullable()
    }
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE') // When user deleted, remove their label tracking

    table.string('plex_rating_key', 50).notNullable()
    table.json('labels_applied').notNullable().defaultTo('[]')
    table.timestamp('synced_at').defaultTo(knex.fn.now())

    // Indexes for efficient lookups
    table.index(['user_id'])
    table.index(['plex_rating_key'])
    table.index(['synced_at'])
    table.index(['content_type'])
  })

  // Handle unique constraint - PostgreSQL cannot create unique constraints on JSON columns directly
  if (isPostgres) {
    // PostgreSQL: Use functional index with MD5 hash of JSON content
    await knex.raw(`
      CREATE UNIQUE INDEX plex_label_tracking_content_unique 
      ON plex_label_tracking(md5(content_guids::text), user_id, plex_rating_key)
    `)
  } else {
    // SQLite: Can handle unique constraint on JSON columns directly
    await knex.schema.alterTable('plex_label_tracking', (table) => {
      table.unique(['content_guids', 'user_id', 'plex_rating_key'])
    })
  }
}

/**
 * Drops the `plex_label_tracking` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Drop the functional index first
    await knex.raw(`
      DROP INDEX IF EXISTS plex_label_tracking_content_unique
    `)
  }

  await knex.schema.dropTableIfExists('plex_label_tracking')

  // Clean up the enum type for PostgreSQL
  if (isPostgres) {
    await knex.raw(`
      DROP TYPE IF EXISTS plex_content_type CASCADE;
    `)
  }
}
