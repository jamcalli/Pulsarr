import type { Knex } from 'knex'

/**
 * Creates tables for the approval system including user quotas, approval requests, and quota usage tracking.
 *
 * This migration adds three new tables:
 * - user_quotas: Configurable quota settings per user (daily, weekly rolling, monthly)
 * - approval_requests: Pending content requests requiring admin approval
 * - quota_usage: Rolling window tracking of user request history
 *
 * The approval system integrates with the content router to interrupt the normal flow
 * when quotas are exceeded or specific criteria are met, storing the router's decision
 * for later execution upon approval.
 */
export async function up(knex: Knex): Promise<void> {
  // Create user_quotas table
  await knex.schema.createTable('user_quotas', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table
      .enum('quota_type', ['daily', 'weekly_rolling', 'monthly'])
      .notNullable()
    table.integer('quota_limit').notNullable()
    table.integer('reset_day').nullable() // For monthly (1-31), weekly_rolling (0-6 day of week)
    table.boolean('bypass_approval').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    // Indexes
    table.unique(['user_id']) // One quota config per user
    table.index(['user_id', 'quota_type'])
    table.index(['bypass_approval'])
  })

  // Create approval_requests table
  await knex.schema.createTable('approval_requests', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.enum('content_type', ['movie', 'show']).notNullable()
    table.string('content_title', 255).notNullable()
    table.string('content_key', 255).notNullable() // Plex key
    table.json('content_guids').defaultTo('[]') // Array of GUIDs

    // Router decision that would have been made
    table.json('router_decision').notNullable() // Full RouterDecision object
    table.integer('router_rule_id').nullable() // Which rule triggered this decision

    // Approval specifics
    table.text('approval_reason').nullable() // Why this needs approval
    table
      .enum('triggered_by', [
        'quota_exceeded',
        'router_rule',
        'manual_flag',
        'content_criteria',
      ])
      .notNullable()

    // Status tracking
    table
      .enum('status', ['pending', 'approved', 'rejected', 'expired'])
      .defaultTo('pending')
    table
      .integer('approved_by')
      .nullable()
      .references('id')
      .inTable('admin_users')
      .onDelete('SET NULL')
    table.text('approval_notes').nullable()
    table.timestamp('expires_at').nullable()

    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    // Indexes
    table.unique(['user_id', 'content_key']) // Prevent duplicate requests
    table.index(['user_id'])
    table.index(['status'])
    table.index(['content_type'])
    table.index(['triggered_by'])
    table.index(['expires_at'])
    table.index(['created_at'])
  })

  // Create quota_usage table for rolling window tracking
  await knex.schema.createTable('quota_usage', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.enum('content_type', ['movie', 'show']).notNullable()
    table.date('request_date').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    // Indexes for efficient quota calculations
    table.index(['user_id', 'request_date'])
    table.index(['user_id', 'content_type', 'request_date'])
    table.index(['request_date']) // For cleanup operations
  })
}

/**
 * Reverts the approval system migration by dropping the approval-related tables.
 */
export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('quota_usage')
  await knex.schema.dropTableIfExists('approval_requests')
  await knex.schema.dropTableIfExists('user_quotas')
}
