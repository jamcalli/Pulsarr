import type { Knex } from 'knex'

/**
 * Adds lifetime quota support.
 *
 * - `lifetime_limit` on `user_quotas`: nullable integer cap per user per content type (null = no lifetime quota)
 * - `newUserDefaultMovieLifetimeLimit` and `newUserDefaultShowLifetimeLimit` on `configs`: default lifetime limits for new users
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_quotas', (table) => {
    table.integer('lifetime_limit').nullable().defaultTo(null)
  })

  await knex.schema.alterTable('configs', (table) => {
    table.integer('newUserDefaultMovieLifetimeLimit').nullable().defaultTo(null)
    table.integer('newUserDefaultShowLifetimeLimit').nullable().defaultTo(null)
  })
}

/**
 * Reverts lifetime quota columns.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_quotas', (table) => {
    table.dropColumn('lifetime_limit')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('newUserDefaultMovieLifetimeLimit')
    table.dropColumn('newUserDefaultShowLifetimeLimit')
  })
}
