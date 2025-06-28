import type { Knex } from 'knex'

/**
 * Adds nullable JSON columns `quotaSettings` and `approvalExpiration` to the `configs` table.
 *
 * These columns are used to store configuration data for quota management and approval expiration policies.
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
 * Removes the `quotaSettings` and `approvalExpiration` columns from the `configs` table to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('quotaSettings')
    table.dropColumn('approvalExpiration')
  })
}
