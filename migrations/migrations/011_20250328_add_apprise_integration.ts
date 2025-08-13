import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies the Apprise integration migration to the database schema.
 *
 * Adds Apprise-related columns to the `configs` table, migrates `deleteSyncNotify` values to new formats, clears and renames email-related fields in the `users` table, and updates the `notifications` table to use Apprise notification tracking. Skips execution for PostgreSQL clients.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '011_20250328_add_apprise_integration')) {
    return
  }
  // 1. Add Apprise settings to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('enableApprise').defaultTo(false)
    table.string('appriseUrl').defaultTo('')
    table.string('systemAppriseUrl').nullable()
  })

  // Set default values for existing rows
  await knex('configs')
    .whereNull('enableApprise')
    .update({ enableApprise: false })

  await knex('configs').whereNull('appriseUrl').update({ appriseUrl: '' })

  // Migrate deleteSyncNotify values to new format
  // First, get all configs with the old values
  const configs = await knex('configs').select('id', 'deleteSyncNotify')

  // Then update them with the new values
  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let newValue = config.deleteSyncNotify

      // Only migrate if it's one of the old values
      if (
        ['none', 'message', 'webhook', 'both'].includes(config.deleteSyncNotify)
      ) {
        // Map old values to new ones
        switch (config.deleteSyncNotify) {
          case 'message':
            newValue = 'discord-message'
            break
          case 'webhook':
            newValue = 'discord-webhook'
            break
          case 'both':
            newValue = 'discord-both'
            break
          // 'none' stays as 'none'
        }

        // Update the config with the new value
        await knex('configs')
          .where('id', config.id)
          .update({ deleteSyncNotify: newValue })
      }
    }
  }

  // 2. Clear all email values since they won't be valid for apprise
  await knex('users').update({ email: null })

  // Ensure all notify_email values are false
  await knex('users').update({ notify_email: false })

  // Modify users table to use Apprise instead of email
  await knex.schema.alterTable('users', (table) => {
    // Rename email column to apprise
    table.renameColumn('email', 'apprise')
    // Rename notify_email to notify_apprise
    table.renameColumn('notify_email', 'notify_apprise')
  })

  // 3. Update notifications table (replacing sent_to_email with sent_to_apprise)
  await knex.schema.alterTable('notifications', (table) => {
    // Add new column
    table.boolean('sent_to_apprise').defaultTo(false)
  })

  // Set default values for existing notifications
  await knex('notifications')
    .whereNull('sent_to_apprise')
    .update({ sent_to_apprise: false })

  // Now that we have the new column, we can drop the old one
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('sent_to_email')
  })
}

/**
 * Reverts the Apprise integration migration by restoring previous schema and data formats.
 *
 * This includes reverting `deleteSyncNotify` values in the `configs` table to their original format, restoring the `sent_to_email` column and removing the `sent_to_apprise` column in the `notifications` table, renaming `apprise` and `notify_apprise` columns back to `email` and `notify_email` in the `users` table, and dropping Apprise-related columns from the `configs` table.
 *
 * @remark This migration is skipped for PostgreSQL clients.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // Revert notification format changes
  const configs = await knex('configs').select('id', 'deleteSyncNotify')

  // Then update them back to the old values
  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let oldValue = config.deleteSyncNotify

      // Only migrate back if it's one of the new values
      if (
        ['discord-message', 'discord-webhook', 'discord-both'].includes(
          config.deleteSyncNotify,
        )
      ) {
        // Map new values back to old ones
        switch (config.deleteSyncNotify) {
          case 'discord-message':
            oldValue = 'message'
            break
          case 'discord-webhook':
            oldValue = 'webhook'
            break
          case 'discord-both':
            oldValue = 'both'
            break
          // Leave other values as they are
        }

        // Update the config with the old value
        await knex('configs')
          .where('id', config.id)
          .update({ deleteSyncNotify: oldValue })
      }
    }
  }

  // Revert changes to notifications table
  await knex.schema.alterTable('notifications', (table) => {
    // Add back the email column
    table.boolean('sent_to_email').defaultTo(false)
    // Then remove the apprise column
    table.dropColumn('sent_to_apprise')
  })

  // Revert changes to users table
  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('apprise', 'email')
    table.renameColumn('notify_apprise', 'notify_email')
  })

  // All email fields will remain null after rollback

  // Revert changes to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('systemAppriseUrl') // Drop the system URL first
    table.dropColumn('enableApprise')
    table.dropColumn('appriseUrl')
  })
}
