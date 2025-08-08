import type { Knex } from 'knex'

/**
 * Creates the `plex_label_tracking` table for tracking label synchronization between users and Plex content.
 *
 * Adapts schema and constraints for PostgreSQL and SQLite, including enum types, JSON column handling, and unique constraints. The table stores associations between users and Plex content items using GUID arrays, content type, and applied labels, supporting persistent label tracking even after content removal from a user's watchlist.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  // Create content_type enum for PostgreSQL if it doesn't exist
  if (isPostgres) {
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plex_content_type') THEN
          CREATE TYPE plex_content_type AS ENUM ('movie', 'show');
        END IF;
      END$$;
    `)
  }

  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()

    // Track by content GUIDs + user instead of watchlist_id to avoid FK constraints
    if (isPostgres) {
      table.specificType('content_guids', 'jsonb').notNullable()
    } else {
      table.json('content_guids').notNullable()
    }

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

    if (isPostgres) {
      table
        .specificType('labels_applied', 'jsonb')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"))
    } else {
      table.json('labels_applied').notNullable().defaultTo('[]')
    }

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
    // Include content_type to distinguish between movies and shows with same GUIDs
    await knex.raw(`
      CREATE UNIQUE INDEX plex_label_tracking_content_unique 
      ON plex_label_tracking(md5(content_guids::text), user_id, content_type)
    `)
  } else {
    // SQLite: Can handle unique constraint on JSON columns directly
    // Include content_type to distinguish between movies and shows with same GUIDs
    await knex.schema.alterTable('plex_label_tracking', (table) => {
      table.unique(['content_guids', 'user_id', 'content_type'])
    })
  }
}

/**
 * Reverts the migration by dropping the `plex_label_tracking` table and associated database objects.
 *
 * For PostgreSQL, also removes the unique functional index and the custom enum type used by the table.
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
