import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.json('quotaSettings').nullable()
    table.json('approvalExpiration').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('quotaSettings')
    table.dropColumn('approvalExpiration')
  })
}
