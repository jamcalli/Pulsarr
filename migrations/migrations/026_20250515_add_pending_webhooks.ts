import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '026_20250515_add_pending_webhooks')) {
    return
  }
  await knex.schema.createTable('pending_webhooks', (table) => {
    table.increments('id').primary()
    table.string('instance_type', 10).notNullable() // 'radarr' or 'sonarr'
    table.integer('instance_id').unsigned().nullable() // Can be null when instance is unknown
    table.string('guid', 255).notNullable()
    table.string('title', 255).notNullable()
    table.string('media_type', 10).notNullable() // 'movie' or 'show'
    table.json('payload').notNullable() // Full webhook payload
    // Timestamps are stored as UTC via ISO strings in the application layer
    table.timestamp('received_at').defaultTo(knex.fn.now()).notNullable()
    table.timestamp('expires_at').notNullable()

    // Simple index for quick lookups by guid
    table.index(['guid', 'media_type'], 'idx_guid_media')
    table.index('expires_at', 'idx_expires')

    // Check constraints for SQLite
    table.check(`"instance_type" IN ('radarr', 'sonarr')`)
    table.check(`"media_type" IN ('movie', 'show')`)
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.dropTableIfExists('pending_webhooks')
}
