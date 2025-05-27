import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add SeerrBridge configuration to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('seerr_bridge_enabled').defaultTo(false);
    table.string('seerr_bridge_base_url');
    table.string('seerr_bridge_webhook_url');
    table.string('seerr_bridge_api_key');
    table.integer('seerr_bridge_timeout_ms').defaultTo(30000);
  });

  // Create table for tracking SeerrBridge requests
  await knex.schema.createTable('seerr_bridge_requests', (table) => {
    table.string('id').primary();
    table.string('request_id').notNullable();
    table.integer('user_id').notNullable();
    table.string('user_name').notNullable();
    table.integer('tmdb_id').notNullable();
    table.string('media_type').notNullable();
    table.string('title').notNullable();
    table.integer('year');
    table.timestamp('requested_at').notNullable();
    table.string('status').notNullable().defaultTo('pending');
    table.timestamp('completed_at');
    table.text('error');
    
    table.index(['user_id']);
    table.index(['tmdb_id', 'media_type']);
    table.index(['status']);
    table.index(['requested_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove SeerrBridge configuration from configs table
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('seerr_bridge_enabled');
    table.dropColumn('seerr_bridge_base_url');
    table.dropColumn('seerr_bridge_webhook_url');
    table.dropColumn('seerr_bridge_api_key');
    table.dropColumn('seerr_bridge_timeout_ms');
  });

  // Drop SeerrBridge requests table
  await knex.schema.dropTableIfExists('seerr_bridge_requests');
}