import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Add a flag to identify the primary token user
    table.boolean('is_primary_token').defaultTo(false)
    // Add an index for faster lookups
    table.index('is_primary_token')
  })
  
  // Set the existing token1 user as the primary token user
  await knex('users')
    .where({ name: 'token1' })
    .update({ is_primary_token: true })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_primary_token')
  })
}