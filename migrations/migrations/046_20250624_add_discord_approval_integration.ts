import type { Knex } from 'knex'

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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('approvalNotify')
  })
}
