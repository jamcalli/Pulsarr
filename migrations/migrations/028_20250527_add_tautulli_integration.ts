import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds Tautulli integration columns to the users, notifications, and configs tables.
 *
 * This migration introduces fields required for Tautulli notifier configuration and notification tracking.
 *
 * @remark No changes are made if the database is PostgreSQL.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '028_20250527_add_tautulli_integration')) {
    return
  }
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

/**
 * Reverts the database schema changes for Tautulli integration by removing related columns from the `configs`, `notifications`, and `users` tables.
 *
 * @remark If running on a PostgreSQL database, this migration is skipped and no changes are made.
 */
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
