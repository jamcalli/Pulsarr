import type { Knex } from 'knex'

/**
 * Controls whether a user is @mentioned in public Discord channel notifications.
 * Independent of notify_discord which controls DM notifications.
 * Default is true to preserve existing behavior.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('notify_discord_mention').defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('notify_discord_mention')
  })
}
