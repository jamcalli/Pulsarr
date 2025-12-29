import type { Knex } from 'knex'

/**
 * Adds appriseEmailSender column to configs table.
 *
 * This allows admins to configure an Apprise email sender URL once,
 * so users can receive notifications by entering just their email address
 * instead of a full Apprise URL.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('appriseEmailSender').nullable()
  })
}

/**
 * Removes appriseEmailSender column from configs table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('appriseEmailSender')
  })
}
