import type { Knex } from 'knex'

/**
 * Adds approval action fields to the router_rules table for controlling approval behavior.
 *
 * This migration adds three new fields:
 * - always_require_approval: Forces approval for this rule regardless of quotas
 * - bypass_user_quotas: Skips quota checks for this rule
 * - approval_reason: Optional reason displayed when approval is required
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
 * Reverts the migration by dropping the approval action fields from the router_rules table.
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
