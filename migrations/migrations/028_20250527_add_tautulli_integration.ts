import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add Tautulli fields to users table
  await knex.schema.alterTable('users', (table) => {
    table.integer('tautulli_notifier_id').nullable()
    table.boolean('notify_tautulli').defaultTo(false)
  })

  // Add sent_to_tautulli to existing notifications table
  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_tautulli').defaultTo(false)
  })

  // Add Tautulli settings to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('tautulliEnabled').defaultTo(false)
    table.string('tautulliUrl').nullable()
    table.string('tautulliApiKey').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tautulliEnabled')
    table.dropColumn('tautulliUrl')
    table.dropColumn('tautulliApiKey')
  })
  
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('sent_to_tautulli')
  })
  
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('tautulli_notifier_id')
    table.dropColumn('notify_tautulli')
  })
}