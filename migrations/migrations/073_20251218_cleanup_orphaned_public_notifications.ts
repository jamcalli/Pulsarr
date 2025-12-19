import type { Knex } from 'knex'

/**
 * Cleans up orphaned public notifications.
 *
 * Public notifications (user_id=null, watchlist_item_id=null) were not being
 * cleaned up when content was removed from all users' watchlists. This caused:
 * 1. Stale notifications persisting forever
 * 2. Deduplication blocking re-notification if content was re-added
 *
 * This migration retroactively cleans up any public notifications where
 * no users currently have the content in their watchlist.
 */
export async function up(knex: Knex): Promise<void> {
  // Delete public notifications where no user has the content watchlisted
  const result = await knex('notifications')
    .where({
      user_id: null,
      watchlist_item_id: null,
      notification_status: 'active',
    })
    .whereNotIn('title', knex('watchlist_items').distinct('title'))
    .del()

  if (result > 0) {
    // Log is not available in migrations, but Knex will show the delete count
    console.log(`Cleaned up ${result} orphaned public notification(s)`)
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Cannot restore deleted notifications - this is a one-way cleanup
  // The data was stale anyway and would have blocked re-notifications
}
