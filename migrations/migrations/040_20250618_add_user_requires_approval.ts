import type { Knex } from 'knex'

/**
 * Adds requires_approval field to users table for user-level approval requirements.
 *
 * This migration adds a requires_approval boolean field to the users table,
 * allowing admins to flag specific users as requiring approval for ALL content
 * requests, regardless of quotas or router rules.
 *
 * This works alongside the existing bypass_approval field in user_quotas:
 * - requires_approval (users table): Does this user need approval for ALL requests?
 * - bypass_approval (user_quotas table): Can this user exceed their quota limits?
 */
export async function up(knex: Knex): Promise<void> {
  // Add requires_approval field to users table
  await knex.schema.alterTable('users', (table) => {
    table.boolean('requires_approval').defaultTo(false)
    table.index(['requires_approval'])
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove requires_approval field from users table
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['requires_approval'])
    table.dropColumn('requires_approval')
  })
}
