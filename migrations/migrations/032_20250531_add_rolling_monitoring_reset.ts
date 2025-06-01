import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // First add the column as nullable
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').nullable()
  })

  // Update existing records to have last_updated_at = updated_at
  await knex('rolling_monitored_shows').update({
    last_updated_at: knex.ref('updated_at')
  })

  // Now make it not nullable and add index
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').notNullable().alter()
    table.index('last_updated_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove the last_updated_at field and its index
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropIndex('last_updated_at')
    table.dropColumn('last_updated_at')
  })
}