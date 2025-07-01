import type { Knex } from 'knex'

/**
 * Alters the `configs` table by adding columns for default user approval and quota settings for movies and shows.
 *
 * Adds boolean, string, and integer columns to manage default requirements for approval, quota enablement, quota type, quota limits, and approval bypass for new users.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('newUserDefaultRequiresApproval').defaultTo(false)
    table.boolean('newUserDefaultMovieQuotaEnabled').defaultTo(false)
    table.string('newUserDefaultMovieQuotaType').defaultTo('monthly')
    table.integer('newUserDefaultMovieQuotaLimit').defaultTo(10)
    table.boolean('newUserDefaultMovieBypassApproval').defaultTo(false)
    table.boolean('newUserDefaultShowQuotaEnabled').defaultTo(false)
    table.string('newUserDefaultShowQuotaType').defaultTo('monthly')
    table.integer('newUserDefaultShowQuotaLimit').defaultTo(10)
    table.boolean('newUserDefaultShowBypassApproval').defaultTo(false)
  })
}

/**
 * Reverts the schema changes by dropping user approval and quota-related columns from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('newUserDefaultRequiresApproval')
    table.dropColumn('newUserDefaultMovieQuotaEnabled')
    table.dropColumn('newUserDefaultMovieQuotaType')
    table.dropColumn('newUserDefaultMovieQuotaLimit')
    table.dropColumn('newUserDefaultMovieBypassApproval')
    table.dropColumn('newUserDefaultShowQuotaEnabled')
    table.dropColumn('newUserDefaultShowQuotaType')
    table.dropColumn('newUserDefaultShowQuotaLimit')
    table.dropColumn('newUserDefaultShowBypassApproval')
  })
}
