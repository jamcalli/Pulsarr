import type { Knex } from 'knex'

/**
 * Adds the `notify_discord_mention` column to the `users` table.
 *
 * @remarks
 * This column controls whether a user is @mentioned in public Discord channel
 * notifications. This is independent of `notify_discord` which controls DM notifications.
 * Default is true to preserve existing behavior.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('notify_discord_mention').defaultTo(true)
  })
}

/**
 * Reverts the migration by dropping the `notify_discord_mention` column.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('notify_discord_mention')
  })
}
