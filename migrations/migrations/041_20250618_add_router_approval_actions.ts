import type { Knex } from 'knex'

/**
 * Applies a schema migration to add approval-related columns and indexes to the `router_rules` table.
 *
 * Adds the `always_require_approval` and `bypass_user_quotas` boolean columns (defaulting to false), a nullable `approval_reason` string column, and creates indexes on the two boolean columns to improve query performance.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Add approval action fields
    table.boolean('always_require_approval').defaultTo(false)
    table.boolean('bypass_user_quotas').defaultTo(false)
    table.string('approval_reason').nullable()

    // Add indexes for performance
    table.index(['always_require_approval'])
    table.index(['bypass_user_quotas'])
  })
}

/**
 * Reverts the migration by dropping the `always_require_approval`, `bypass_user_quotas`, and `approval_reason` columns and their associated indexes from the `router_rules` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropIndex(['always_require_approval'])
    table.dropIndex(['bypass_user_quotas'])
    table.dropColumn('always_require_approval')
    table.dropColumn('bypass_user_quotas')
    table.dropColumn('approval_reason')
  })
}
