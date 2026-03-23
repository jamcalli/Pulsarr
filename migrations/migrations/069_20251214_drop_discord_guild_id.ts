import type { Knex } from 'knex'

/**
 * Removes the deprecated discordGuildId config column.
 *
 * Discord commands are now registered globally (for DM support) rather than
 * per-guild, so the guild ID is no longer required for bot operation.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('discordGuildId')
  })
}

/**
 * Restores the discordGuildId column for rollback.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('discordGuildId')
  })
}
