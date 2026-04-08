import type { Knex } from 'knex'

/**
 * Allows admins to configure an Apprise email sender URL once,
 * so users can receive notifications by entering just their email address
 * instead of a full Apprise URL.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('appriseEmailSender').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('appriseEmailSender')
  })
}
