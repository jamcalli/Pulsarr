import type { Knex } from 'knex'

/**
 * Adds native webhook support for admin-configurable outbound webhooks.
 *
 * 1. Creates `webhook_endpoints` table for storing webhook configurations
 * 2. Adds `sent_to_native_webhook` column to notifications table for stats tracking
 */
export async function up(knex: Knex): Promise<void> {
  // Create webhook endpoints table
  await knex.schema.createTable('webhook_endpoints', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('url').notNullable()
    table.string('auth_header_name').nullable()
    table.string('auth_header_value').nullable()
    table.json('event_types').notNullable()
    table.boolean('enabled').notNullable().defaultTo(true)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

    // Index for efficient filtering of enabled endpoints
    table.index('enabled')
  })

  // Add webhook tracking column to notifications table for stats
  // This enables native webhooks to appear in notification stats UI
  // alongside Discord, Apprise, and Tautulli channels
  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_native_webhook').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('sent_to_native_webhook')
  })
  await knex.schema.dropTableIfExists('webhook_endpoints')
}
