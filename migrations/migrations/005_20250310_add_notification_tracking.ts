import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.string('content_guid').nullable()
    table.integer('season_number').nullable()
    table.integer('episode_number').nullable()
    table.string('notification_status').defaultTo('active')
  })

  await knex('notifications')
    .whereNull('notification_status')
    .update({ notification_status: 'active' })

  await knex.schema.alterTable('notifications', (table) => {
    table.index(
      ['content_guid', 'season_number', 'episode_number', 'user_id', 'notification_status'],
      'idx_notifications_content'
    )
    table.index(['type', 'notification_status'], 'idx_notifications_type_status')
    table.index(['user_id', 'notification_status'], 'idx_notifications_user_status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex(
      ['content_guid', 'season_number', 'episode_number', 'user_id', 'notification_status'],
      'idx_notifications_content'
    )
    table.dropIndex(['type', 'notification_status'], 'idx_notifications_type_status')
    table.dropIndex(['user_id', 'notification_status'], 'idx_notifications_user_status')
    table.dropColumn('content_guid')
    table.dropColumn('season_number')
    table.dropColumn('episode_number')
    table.dropColumn('notification_status')
  })
}