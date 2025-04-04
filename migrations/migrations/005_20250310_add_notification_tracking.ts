import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.string('notification_status').defaultTo('active')
  })

  await knex('notifications')
    .whereNull('notification_status')
    .update({ notification_status: 'active' })

  await knex.schema.alterTable('notifications', (table) => {
    table.index(['watchlist_item_id', 'type', 'notification_status'], 'idx_notifications_status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex(['watchlist_item_id', 'type', 'notification_status'], 'idx_notifications_status')
    table.dropColumn('notification_status')
  })
}