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
 * no users currently have the content in their watchlist, with type matching:
 * - Movie notifications match watchlist_items.type = 'movie'
 * - Episode/season notifications match watchlist_items.type = 'show'
 */
export async function up(knex: Knex): Promise<void> {
  // Delete orphaned movie notifications
  const movieResult = await knex('notifications')
    .where({
      user_id: null,
      watchlist_item_id: null,
      notification_status: 'active',
      type: 'movie',
    })
    .whereNotIn(
      'title',
      knex('watchlist_items').where('type', 'movie').distinct('title'),
    )
    .del()

  // Delete orphaned show notifications (episode/season)
  const showResult = await knex('notifications')
    .where({
      user_id: null,
      watchlist_item_id: null,
      notification_status: 'active',
    })
    .whereIn('type', ['episode', 'season'])
    .whereNotIn(
      'title',
      knex('watchlist_items').where('type', 'show').distinct('title'),
    )
    .del()

  const total = movieResult + showResult
  if (total > 0) {
    console.log(
      `Cleaned up ${total} orphaned public notification(s) (${movieResult} movies, ${showResult} shows)`,
    )
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Cannot restore deleted notifications - this is a one-way cleanup
  // The data was stale anyway and would have blocked re-notifications
}
