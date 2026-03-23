import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
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
    table.boolean('bypass_approval').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['user_id'])
    table.index(['user_id', 'quota_type'])
    table.index(['bypass_approval'])
  })

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
    table.string('content_key', 255).notNullable()
    table.json('content_guids').defaultTo('[]')

    table.json('router_decision').notNullable()
    table.integer('router_rule_id').nullable()

    table.text('approval_reason').nullable()
    table
      .enum('triggered_by', [
        'quota_exceeded',
        'router_rule',
        'manual_flag',
        'content_criteria',
      ])
      .notNullable()

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

    table.unique(['user_id', 'content_key'])
    table.index(['user_id'])
    table.index(['status'])
    table.index(['content_type'])
    table.index(['triggered_by'])
    table.index(['expires_at'])
    table.index(['created_at'])
  })

  await knex.schema.createTable('quota_usage', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.enum('content_type', ['movie', 'show']).notNullable()
    // Use date (not timestamp) for quota calculations to align with calendar days
    // This ensures quotas reset at midnight regardless of request timing
    table.date('request_date').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'request_date'])
    table.index(['user_id', 'content_type', 'request_date'])
    table.index(['request_date'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quota_usage')
  await knex.schema.dropTableIfExists('approval_requests')
  await knex.schema.dropTableIfExists('user_quotas')
}
