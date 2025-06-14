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

/**
 * Drops the unique constraint to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
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
