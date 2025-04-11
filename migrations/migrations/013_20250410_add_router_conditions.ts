import type { Knex } from 'knex'

/**
 * Migration to add router_conditions table for storing query-based routing rule conditions
 * 
 * This migration adds support for complex query conditions in the router system.
 * It creates a table to store individual conditions that can be combined with
 * logical operators (AND, OR, NOT) to form complex routing rules.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('router_conditions', (table) => {
    table.increments('id').primary();
    table.integer('rule_id').notNullable()
      .references('id')
      .inTable('router_rules')
      .onDelete('CASCADE');
    table.string('predicate_type').notNullable(); // e.g., 'genre', 'year', 'language'
    table.string('operator').notNullable(); // e.g., 'EQUALS', 'IN', 'GREATER_THAN'
    table.text('value').notNullable(); // JSON stringified value
    table.integer('group_id').nullable(); // Reference to a group condition
    table.string('group_operator').nullable(); // 'AND', 'OR', 'NOT' for groups
    table.integer('parent_group_id').nullable(); // For nested groups
    table.integer('order_index').defaultTo(0); // For maintaining order of conditions
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Add appropriate indexes
    table.index('rule_id');
    table.index(['rule_id', 'predicate_type']);
    table.index('group_id');
  });
  
  // Add query_type column to router_rules to distinguish between legacy and query-builder rules
  await knex.schema.alterTable('router_rules', (table) => {
    table.string('query_type').defaultTo('legacy');
  });
  
  // Update existing rules to be marked as legacy
  await knex('router_rules').update('query_type', 'legacy');
}

export async function down(knex: Knex): Promise<void> {
  // Drop the query_type column
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('query_type');
  });
  
  // Drop the conditions table
  await knex.schema.dropTable('router_conditions');
}