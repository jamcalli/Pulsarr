import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

const CLAIM_SCOPE =
  "notification_status = 'active' AND type IN ('episode', 'season', 'movie')"

export async function up(knex: Knex): Promise<void> {
  if (isPostgreSQL(knex)) {
    await knex.raw(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_unique_content_user',
    )
  } else {
    await knex.raw('DROP INDEX IF EXISTS notifications_unique_content_user')
  }

  await knex.raw(`
    DELETE FROM notifications
    WHERE ${CLAIM_SCOPE} AND user_id IS NOT NULL
      AND id NOT IN (
        SELECT MAX(id) FROM notifications
        WHERE ${CLAIM_SCOPE} AND user_id IS NOT NULL
        GROUP BY user_id, watchlist_item_id, type, COALESCE(season_number, -1), COALESCE(episode_number, -1)
      )
  `)
  await knex.raw(`
    DELETE FROM notifications
    WHERE ${CLAIM_SCOPE} AND user_id IS NULL
      AND id NOT IN (
        SELECT MAX(id) FROM notifications
        WHERE ${CLAIM_SCOPE} AND user_id IS NULL
        GROUP BY title, type, COALESCE(season_number, -1), COALESCE(episode_number, -1)
      )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX notifications_claim_user_unique
    ON notifications (user_id, watchlist_item_id, type, COALESCE(season_number, -1), COALESCE(episode_number, -1))
    WHERE ${CLAIM_SCOPE} AND user_id IS NOT NULL
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX notifications_claim_public_unique
    ON notifications (title, type, COALESCE(season_number, -1), COALESCE(episode_number, -1))
    WHERE ${CLAIM_SCOPE} AND user_id IS NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS notifications_claim_user_unique')
  await knex.raw('DROP INDEX IF EXISTS notifications_claim_public_unique')

  if (isPostgreSQL(knex)) {
    await knex.raw(`
      ALTER TABLE notifications
      ADD CONSTRAINT notifications_unique_content_user
      UNIQUE (user_id, watchlist_item_id, type, season_number, episode_number, notification_status)
    `)
  } else {
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
        { indexName: 'notifications_unique_content_user' },
      )
    })
  }
}
