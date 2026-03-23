import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  // Remove existing duplicates before adding the unique constraint, keeping the most recent
  if (isPostgres) {
    // PG can't use NOT IN with subqueries that return NULL, so CTE with ROW_NUMBER is safer
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
        'notifications_unique_content_user',
      )
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    await knex.raw(`
      ALTER TABLE notifications
      DROP CONSTRAINT IF EXISTS notifications_unique_content_user
    `)
  } else {
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
