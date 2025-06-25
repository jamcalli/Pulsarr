import type { Knex } from 'knex'

/**
 * Adds `quotaSettings` and `approvalExpiration` JSON columns to the `configs` table.
 *
 * These columns are intended to store configuration data for quota management and approval expiration policies.
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
 * Drops the `quotaSettings` and `approvalExpiration` JSON columns from the `configs` table, reverting the schema changes introduced by the corresponding migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('quotaSettings')
    table.dropColumn('approvalExpiration')
  })
}
