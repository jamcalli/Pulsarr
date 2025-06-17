import type { Knex } from 'knex'

/**
 * Adds a unique constraint to prevent duplicate notifications for the same content.
 *
 * This constraint ensures that only one active notification can exist for a given combination of:
 * - user_id
 * - watchlist_item_id
 * - type (episode/season/movie/watchlist_add)
 * - season_number (nullable)
 * - episode_number (nullable)
 * - notification_status
 *
 * This prevents race conditions where multiple processes could create duplicate notifications
 * for the same content and user.
 */
export async function up(knex: Knex): Promise<void> {
  // First, identify and remove duplicate notifications
  // Keep the most recent notification for each unique combination
  const duplicateQuery = `
    DELETE FROM notifications 
    WHERE id NOT IN (
      SELECT MAX(id) 
      FROM notifications 
      GROUP BY user_id, watchlist_item_id, type, season_number, episode_number, notification_status
    )
  `

  const deletedCount = await knex.raw(duplicateQuery)
  console.log(
    `Cleaned up ${deletedCount.rowCount || deletedCount.changes || 0} duplicate notifications`,
  )

  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Use two-step approach with NOT VALID then VALIDATE
    await knex.raw(`
      ALTER TABLE notifications
      ADD CONSTRAINT notifications_unique_content_user
      UNIQUE (user_id, watchlist_item_id, type, season_number, episode_number, notification_status)
      NOT VALID
    `)

    await knex.raw(`
      ALTER TABLE notifications
      VALIDATE CONSTRAINT notifications_unique_content_user
    `)
  } else {
    // SQLite: Use standard unique constraint after cleanup
    await knex.schema.alterTable('notifications', (table) => {
      table.unique(
        [
          'user_id',
          'watchlist_item_id',
          'type',
          'season_number',
          'episode_number',
          'notification_status',
        ],
        'notifications_unique_content_user',
      )
    })
  }
}

/**
 * Drops the unique constraint to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Drop constraint using raw SQL
    await knex.raw(`
      ALTER TABLE notifications
      DROP CONSTRAINT IF EXISTS notifications_unique_content_user
    `)
  } else {
    // SQLite: Use schema builder
    await knex.schema.alterTable('notifications', (table) => {
      table.dropUnique(
        [
          'user_id',
          'watchlist_item_id',
          'type',
          'season_number',
          'episode_number',
          'notification_status',
        ],
        'notifications_unique_content_user',
      )
    })
  }
}
