import type { Knex } from 'knex'

/**
 * Adds a unique constraint to the `notifications` table to prevent duplicate notifications for the same user and content combination.
 *
 * Removes existing duplicate notifications, retaining only the most recent entry for each unique set of `user_id`, `watchlist_item_id`, `type`, `season_number`, `episode_number`, and `notification_status`. Then enforces uniqueness on these columns to prevent future duplicates.
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
