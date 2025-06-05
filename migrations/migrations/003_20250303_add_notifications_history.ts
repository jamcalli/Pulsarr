import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 003_20250303_add_notifications_history - PostgreSQL uses consolidated schema in migration 034')
    return
  }
await knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.integer('watchlist_item_id')
      .nullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE');
    table.integer('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.enum('type', ['episode', 'season', 'movie', 'watchlist_add']).notNullable();
    table.string('title').notNullable();
    table.string('message').nullable();
    table.integer('season_number').nullable();
    table.integer('episode_number').nullable();
    table.boolean('sent_to_discord').defaultTo(false);
    table.boolean('sent_to_email').defaultTo(false);
    table.boolean('sent_to_webhook').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['watchlist_item_id']);
    table.index(['user_id']);
    table.index(['created_at']);
    table.index(['type']);
  });
}

export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.dropTable('notifications');
}