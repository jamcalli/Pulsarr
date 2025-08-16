import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies the migration to add notification status tracking to the notifications table.
 *
 * Adds a `notification_status` column with a default value of `'active'`, updates existing rows with `NULL` status to `'active'`, and creates an index on `watchlist_item_id`, `type`, and `notification_status`.
 *
 * @remark
 * This migration is skipped when running on PostgreSQL.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '005_20250310_add_notification_tracking')) {
    return
  }
  await knex.schema.alterTable('notifications', (table) => {
    table.string('notification_status').defaultTo('active')
  })

  await knex('notifications')
    .whereNull('notification_status')
    .update({ notification_status: 'active' })

  await knex.schema.alterTable('notifications', (table) => {
    table.index(
      ['watchlist_item_id', 'type', 'notification_status'],
      'idx_notifications_status',
    )
  })
}

/**
 * Reverts the notification status tracking changes in the `notifications` table.
 *
 * Drops the `notification_status` column and the associated index from the `notifications` table, unless running on PostgreSQL.
 *
 * @remark This migration is skipped on PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex(
      ['watchlist_item_id', 'type', 'notification_status'],
      'idx_notifications_status',
    )
    table.dropColumn('notification_status')
  })
}
