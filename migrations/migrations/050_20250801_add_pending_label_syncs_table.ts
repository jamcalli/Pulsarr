import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  await knex.schema.createTable('pending_label_syncs', (table) => {
    table.increments('id').primary()
    table
      .integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.string('content_title', 255).notNullable()

    if (isPostgres) {
      table
        .specificType('webhook_tags', 'jsonb')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"))
    } else {
      table.json('webhook_tags').notNullable().defaultTo('[]')
    }

    table.integer('retry_count').defaultTo(0)
    table.timestamp('last_retry_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('expires_at').notNullable()

    table.unique(['watchlist_item_id'])
    table.index(['watchlist_item_id'])
    table.index(['expires_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pending_label_syncs')
}
