import type { Knex } from 'knex'

/**
 * Adds the `newUserDefaultCanSync` boolean column to the `configs` table with a default value of `true`.
 *
 * @param knex - The Knex instance used to perform the schema alteration.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('newUserDefaultCanSync').defaultTo(true)
  })
}

/**
 * Removes the `newUserDefaultCanSync` column from the `configs` table.
 *
 * Reverts the schema change introduced by the corresponding migration's `up` function.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('newUserDefaultCanSync')
  })
}