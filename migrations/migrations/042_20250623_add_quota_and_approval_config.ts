import type { Knex } from 'knex'

/**
 * Adds quota settings and approval expiration configuration columns to the configs table.
 * These columns store JSON configuration for quota management and approval expiration policies.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    // Quota system configuration
    table.json('quotaSettings').nullable()

    // Approval expiration configuration
    table.json('approvalExpiration').nullable()
  })
}

/**
 * Removes the quota settings and approval expiration configuration columns from the configs table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('quotaSettings')
    table.dropColumn('approvalExpiration')
  })
}
