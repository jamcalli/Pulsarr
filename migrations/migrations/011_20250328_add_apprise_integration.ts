import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '011_20250328_add_apprise_integration')) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('enableApprise').defaultTo(false)
    table.string('appriseUrl').defaultTo('')
    table.string('systemAppriseUrl').nullable()
  })

  await knex('configs')
    .whereNull('enableApprise')
    .update({ enableApprise: false })

  await knex('configs').whereNull('appriseUrl').update({ appriseUrl: '' })

  const configs = await knex('configs').select('id', 'deleteSyncNotify')

  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let newValue = config.deleteSyncNotify

      if (
        ['none', 'message', 'webhook', 'both'].includes(config.deleteSyncNotify)
      ) {
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

        await knex('configs')
          .where('id', config.id)
          .update({ deleteSyncNotify: newValue })
      }
    }
  }

  // Clear email values before renaming - they won't be valid apprise URLs
  await knex('users').update({ email: null })
  await knex('users').update({ notify_email: false })

  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('email', 'apprise')
    table.renameColumn('notify_email', 'notify_apprise')
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_apprise').defaultTo(false)
  })

  await knex('notifications')
    .whereNull('sent_to_apprise')
    .update({ sent_to_apprise: false })

  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('sent_to_email')
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  const configs = await knex('configs').select('id', 'deleteSyncNotify')

  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let oldValue = config.deleteSyncNotify

      if (
        ['discord-message', 'discord-webhook', 'discord-both'].includes(
          config.deleteSyncNotify,
        )
      ) {
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
        }

        await knex('configs')
          .where('id', config.id)
          .update({ deleteSyncNotify: oldValue })
      }
    }
  }

  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_email').defaultTo(false)
    table.dropColumn('sent_to_apprise')
  })

  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('apprise', 'email')
    table.renameColumn('notify_apprise', 'notify_email')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('systemAppriseUrl')
    table.dropColumn('enableApprise')
    table.dropColumn('appriseUrl')
  })
}
