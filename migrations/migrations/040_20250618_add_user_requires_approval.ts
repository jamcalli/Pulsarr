import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('requires_approval').defaultTo(false)
    table.index(['requires_approval'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['requires_approval'])
    table.dropColumn('requires_approval')
  })
}
