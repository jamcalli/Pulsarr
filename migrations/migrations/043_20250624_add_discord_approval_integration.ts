import type { Knex } from 'knex'

/**
 * Adds the `approvalNotify` enum column to the `configs` table to specify notification methods for new approval requests.
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
 * Removes the `approvalNotify` column from the `configs` table, reverting the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('approvalNotify')
  })
}
