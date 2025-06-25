import type { Knex } from 'knex'

/**
 * Alters the `router_rules` table by adding approval-related columns and indexes.
 *
 * Adds the `always_require_approval` and `bypass_user_quotas` boolean columns (both defaulting to false) and the nullable `approval_reason` string column. Indexes are created on the two boolean columns to optimize query performance.
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
 * Reverts the migration by removing the approval-related columns and their indexes from the `router_rules` table.
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
