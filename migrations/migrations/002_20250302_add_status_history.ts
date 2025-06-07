import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

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

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.dropTable('watchlist_status_history')
}
