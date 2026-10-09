import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('watchlist_routing_failures', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    // 0 marks an item-level failure, so the unique key never holds a NULL
    table.integer('instance_id').notNullable().defaultTo(0)
    table.string('category').notNullable()
    table.text('message').notNullable().defaultTo('')
    table.integer('attempt_count').notNullable().defaultTo(1)
    table.timestamp('first_failed_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('last_failed_at').notNullable().defaultTo(knex.fn.now())

    table.unique(['watchlist_item_id', 'instance_id'])
    table.index('category')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('watchlist_routing_failures')
}
