import type { Knex } from 'knex'

/**
 * Quiet hours + digest batching for media-available user notifications.
 *
 * - `configs.notificationDelivery` (JSON): admin defaults every user inherits.
 * - `users.notify_*` schedule columns: per-user overrides; NULL = inherit.
 * - `held_notifications`: notifications waiting for their digest/quiet-hours
 *   delivery time, persisted so they survive a restart.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('notificationDelivery').nullable()
  })

  await knex.schema.alterTable('users', (table) => {
    table.string('notify_digest_mode', 10).nullable()
    table.integer('notify_digest_window_minutes').nullable()
    table.string('notify_digest_time', 5).nullable()
    table.boolean('notify_quiet_hours_enabled').nullable()
    table.string('notify_quiet_hours_start', 5).nullable()
    table.string('notify_quiet_hours_end', 5).nullable()
    table.string('notify_timezone', 64).nullable()
  })

  await knex.schema.createTable('held_notifications', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.string('media_type', 10).notNullable()
    table.string('guid', 255).notNullable()
    table.string('title', 255).notNullable()
    // Plex watchlist key, needed to resolve the Plex mobile deep link at delivery
    table.string('watchlist_item_key', 255).nullable()
    table.boolean('is_bulk_release').notNullable().defaultTo(false)
    // Episodes covered by this row: [{ seasonNumber, episodeNumber }]
    table.json('episodes').notNullable().defaultTo('[]')
    // The MediaNotification exactly as it would have been sent immediately
    table.json('notification').notNullable()
    table.string('reason', 20).notNullable()
    // Timestamps are stored as UTC via ISO strings in the application layer
    table.timestamp('deliver_after').notNullable()
    table.timestamp('claimed_at').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index(['user_id', 'claimed_at'])
    table.index('deliver_after')
    table.check(`"media_type" IN ('movie', 'show')`)
    table.check(`"reason" IN ('digest', 'quiet_hours')`)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('held_notifications')

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('notify_digest_mode')
    table.dropColumn('notify_digest_window_minutes')
    table.dropColumn('notify_digest_time')
    table.dropColumn('notify_quiet_hours_enabled')
    table.dropColumn('notify_quiet_hours_start')
    table.dropColumn('notify_quiet_hours_end')
    table.dropColumn('notify_timezone')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('notificationDelivery')
  })
}
