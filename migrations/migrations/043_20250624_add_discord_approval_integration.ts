import type { Knex } from 'knex'

/**
 * Alters the `configs` table by adding an `approvalNotify` enum column to define notification methods for new approval requests.
 *
 * The new column supports multiple notification options, such as 'none', 'all', and various Discord, Apprise, webhook, and DM combinations. The default value is 'none'.
 */
export async function up(knex: Knex): Promise<void> {
  // Add approval notification configuration
  await knex.schema.alterTable('configs', (table) => {
    table
      .enum('approvalNotify', [
        'none',
        'all',
        'discord-only',
        'apprise-only',
        'webhook-only',
        'dm-only',
        'discord-webhook',
        'discord-message',
        'discord-both',
      ])
      .defaultTo('none')
      .comment('Notification method for new approval requests')
  })
}

/**
 * Drops the `approvalNotify` column from the `configs` table to revert the schema change.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('approvalNotify')
  })
}
