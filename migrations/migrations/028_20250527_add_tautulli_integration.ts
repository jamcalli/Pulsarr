import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '028_20250527_add_tautulli_integration')) {
    return
  }
  await knex.schema.alterTable('users', (table) => {
    table.integer('tautulli_notifier_id').nullable()
    table.boolean('notify_tautulli').defaultTo(false)
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_tautulli').defaultTo(false)
  })

  await knex.schema.alterTable('configs', (table) => {
    table.boolean('tautulliEnabled').defaultTo(false)
    table.string('tautulliUrl').nullable()
    table.string('tautulliApiKey').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
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
