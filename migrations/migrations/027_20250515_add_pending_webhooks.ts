import type { Knex } from 'knex'

/**
 * Creates the `pending_webhooks` table to store incoming webhook data with constraints and indexes.
 *
 * The table includes columns for instance type, instance ID, GUID, title, media type, payload, received timestamp, and expiration timestamp. It enforces allowed values for `instance_type` and `media_type`, and adds indexes for efficient lookups.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pending_webhooks', (table) => {
    table.increments('id').primary()
    table.string('instance_type', 10).notNullable() // 'radarr' or 'sonarr'
    table.integer('instance_id').unsigned().notNullable()
    table.string('guid', 255).notNullable()
    table.string('title', 255).notNullable()
    table.string('media_type', 10).notNullable() // 'movie' or 'show'
    table.json('payload').notNullable() // Full webhook payload
    table.datetime('received_at').defaultTo(knex.fn.now()).notNullable()
    table.datetime('expires_at').notNullable()
    
    // Simple index for quick lookups by guid
    table.index(['guid', 'media_type'], 'idx_guid_media')
    table.index('expires_at', 'idx_expires')
    
    // Check constraints for SQLite
    table.check(`"instance_type" IN ('radarr', 'sonarr')`)
    table.check(`"media_type" IN ('movie', 'show')`)
  })
}

/**
 * Drops the 'pending_webhooks' table from the database if it exists.
 *
 * Use this to roll back the migration that creates the {@link pending_webhooks} table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pending_webhooks')
}