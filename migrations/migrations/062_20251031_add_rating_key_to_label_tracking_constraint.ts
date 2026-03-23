import type { Knex } from 'knex'

/**
 * Adds plex_rating_key to the unique constraint on plex_label_tracking table.
 *
 * This fixes a bug where multiple editions of the same movie (sharing the same content GUIDs
 * but with different Plex rating keys) could not be tracked separately. Each edition in Plex
 * is a distinct item with its own rating key, so we need to include the rating key in the
 * unique constraint to allow separate label tracking per edition.
 *
 * Changes the unique constraint from:
 *   (content_guids, user_id, content_type)
 * to:
 *   (content_guids, user_id, content_type, plex_rating_key)
 */
export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Drop the old functional index and create a new one with plex_rating_key
    await knex.raw(`
      DROP INDEX IF EXISTS plex_label_tracking_content_unique
    `)

    await knex.raw(`
      CREATE UNIQUE INDEX plex_label_tracking_content_unique
      ON plex_label_tracking(md5(content_guids::text), user_id, content_type, plex_rating_key)
    `)
  } else {
    // SQLite: Drop the old unique constraint and create a new one with plex_rating_key
    // SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we need to recreate the table
    await knex.raw(`
      CREATE TABLE plex_label_tracking_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_guids TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('movie', 'show')),
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plex_rating_key VARCHAR(50) NOT NULL,
        labels_applied TEXT NOT NULL DEFAULT '[]',
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(content_guids, user_id, content_type, plex_rating_key)
      )
    `)

    // Copy data from old table to new table
    await knex.raw(`
      INSERT INTO plex_label_tracking_new
        (id, content_guids, content_type, user_id, plex_rating_key, labels_applied, synced_at)
      SELECT id, content_guids, content_type, user_id, plex_rating_key, labels_applied, synced_at
      FROM plex_label_tracking
    `)

    // Drop old table and rename new table
    await knex.raw(`DROP TABLE plex_label_tracking`)
    await knex.raw(
      `ALTER TABLE plex_label_tracking_new RENAME TO plex_label_tracking`,
    )

    // Recreate indexes
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_user_id ON plex_label_tracking(user_id)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_plex_rating_key ON plex_label_tracking(plex_rating_key)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_synced_at ON plex_label_tracking(synced_at)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_content_type ON plex_label_tracking(content_type)`,
    )
  }
}

/**
 * Reverts the unique constraint to its original form without plex_rating_key.
 *
 * Note: This migration down could cause data loss if there are multiple records
 * with the same (content_guids, user_id, content_type) but different plex_rating_keys.
 * The first record for each combination will be kept, and duplicates will be removed.
 */
export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // Remove duplicates before applying the old constraint
    await knex.raw(`
      DELETE FROM plex_label_tracking
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM plex_label_tracking
        GROUP BY md5(content_guids::text), user_id, content_type
      )
    `)

    // Drop the new index and restore the old one
    await knex.raw(`
      DROP INDEX IF EXISTS plex_label_tracking_content_unique
    `)

    await knex.raw(`
      CREATE UNIQUE INDEX plex_label_tracking_content_unique
      ON plex_label_tracking(md5(content_guids::text), user_id, content_type)
    `)
  } else {
    // Remove duplicates before applying the old constraint
    await knex.raw(`
      DELETE FROM plex_label_tracking
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM plex_label_tracking
        GROUP BY content_guids, user_id, content_type
      )
    `)

    // Recreate table with old constraint
    await knex.raw(`
      CREATE TABLE plex_label_tracking_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_guids TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('movie', 'show')),
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plex_rating_key VARCHAR(50) NOT NULL,
        labels_applied TEXT NOT NULL DEFAULT '[]',
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(content_guids, user_id, content_type)
      )
    `)

    // Copy data from old table to new table
    await knex.raw(`
      INSERT INTO plex_label_tracking_new
        (id, content_guids, content_type, user_id, plex_rating_key, labels_applied, synced_at)
      SELECT id, content_guids, content_type, user_id, plex_rating_key, labels_applied, synced_at
      FROM plex_label_tracking
    `)

    // Drop old table and rename new table
    await knex.raw(`DROP TABLE plex_label_tracking`)
    await knex.raw(
      `ALTER TABLE plex_label_tracking_new RENAME TO plex_label_tracking`,
    )

    // Recreate indexes
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_user_id ON plex_label_tracking(user_id)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_plex_rating_key ON plex_label_tracking(plex_rating_key)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_synced_at ON plex_label_tracking(synced_at)`,
    )
    await knex.raw(
      `CREATE INDEX idx_plex_label_tracking_content_type ON plex_label_tracking(content_type)`,
    )
  }
}
