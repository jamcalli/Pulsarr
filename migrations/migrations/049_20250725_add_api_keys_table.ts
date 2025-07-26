import type { Knex } from 'knex'

/**
 * Creates the `api_keys` table with columns for ID, name, unique key, creation timestamp, and active status.
 *
 * The table includes indexes on the `key` and `is_active` columns to optimize query performance.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_keys', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('key').notNullable().unique()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.boolean('is_active').defaultTo(true)

    table.index('key')
    table.index('is_active')
  })
}

/**
 * Drops the `api_keys` table from the database if it exists.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_keys')
}
