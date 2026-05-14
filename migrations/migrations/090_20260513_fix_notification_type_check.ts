import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * SQLite needs the column-rename trick to expand the CHECK constraint that
 * Knex's table.enum() emits. Postgres keeps its native notification_type
 * enum (extend via ALTER TYPE).
 */
export async function up(knex: Knex): Promise<void> {
  if (isPostgreSQL(knex)) return

  await knex.schema.alterTable('notifications', (table) => {
    table
      .enum('type_new', [
        'episode',
        'season',
        'movie',
        'watchlist_add',
        'watchlist_removed',
        'approval_resolved',
        'approval_auto',
        'user_created',
        'watchlist_cap',
      ])
      .notNullable()
      .defaultTo('episode')
  })

  await knex('notifications').update({
    type_new: knex.ref('type'),
  })

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
    table.dropIndex(
      ['watchlist_item_id', 'type', 'notification_status'],
      'idx_notifications_status',
    )
    table.dropIndex(['type'])
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('type')
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.renameColumn('type_new', 'type')
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.index(['type'])
    table.index(
      ['watchlist_item_id', 'type', 'notification_status'],
      'idx_notifications_status',
    )
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

export async function down(_knex: Knex): Promise<void> {
  // Reapplying the CHECK would fail any row written with a newer type value.
}
