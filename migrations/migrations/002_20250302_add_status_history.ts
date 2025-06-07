import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Creates the `watchlist_status_history` table to track status changes for watchlist items.
 *
 * The table includes an auto-incrementing primary key, a foreign key to `watchlist_items`, a status enum, a timestamp, and relevant indexes.
 *
 * @remark
 * If the migration should be skipped for the current PostgreSQL client, no changes are made.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '002_20250302_add_status_history')) {
    return
  }
  await knex.schema.createTable('watchlist_status_history', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table
      .enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
    table.timestamp('timestamp').defaultTo(knex.fn.now())
    table.index(['watchlist_item_id', 'status'])
    table.index('timestamp')
  })
}

/**
 * Drops the `watchlist_status_history` table if it exists, unless the operation should be skipped for PostgreSQL clients.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.dropTable('watchlist_status_history')
}
