import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('rssSafetyNetEnabled').defaultTo(false)
    table.integer('rssSafetyNetIntervalMinutes').defaultTo(30)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('rssSafetyNetEnabled')
    table.dropColumn('rssSafetyNetIntervalMinutes')
  })
}
