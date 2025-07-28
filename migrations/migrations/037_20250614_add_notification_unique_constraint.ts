import type { Knex } from 'knex'

/**
 * Adds a unique constraint to the `notifications` table to prevent duplicate notifications for the same user and content combination.
 *
 * Removes existing duplicate notifications, keeping only the most recent entry for each unique set of `user_id`, `watchlist_item_id`, `type`, `season_number`, `episode_number`, and `notification_status`, then enforces uniqueness on these columns for future inserts.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg'

  // First, identify and remove duplicate notifications
  // Keep the most recent notification for each unique combination
  if (isPostgres) {
    // PostgreSQL: Use a more reliable approach with CTEs to avoid subquery issues
    const duplicateQuery = `
      WITH duplicates AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY user_id, watchlist_item_id, type, season_number, episode_number, notification_status 
          ORDER BY id DESC
        ) as rn 
        FROM notifications
      )
      DELETE FROM notifications 
      WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
    `
    await knex.raw(duplicateQuery)
  } else {
    // SQLite: Original query works fine
    const duplicateQuery = `
      DELETE FROM notifications 
      WHERE id NOT IN (
        SELECT MAX(id) 
        FROM notifications 
        GROUP BY user_id, watchlist_item_id, type, season_number, episode_number, notification_status
      )
    `
    await knex.raw(duplicateQuery)
  }

  if (isPostgres) {
    // PostgreSQL: Add constraint directly after cleaning duplicates
    await knex.raw(`
      ALTER TABLE notifications
      ADD CONSTRAINT notifications_unique_content_user
      UNIQUE (user_id, watchlist_item_id, type, season_number, episode_number, notification_status)
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
 * Reverts the migration by removing the unique constraint from the `notifications` table.
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
