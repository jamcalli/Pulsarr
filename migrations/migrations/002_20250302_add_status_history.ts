import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('watchlist_status_history', (table) => {
    table.increments('id').primary()
    table.integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
    table.timestamp('timestamp').defaultTo(knex.fn.now())
    table.index(['watchlist_item_id', 'status'])
    table.index('timestamp')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('watchlist_status_history')
}