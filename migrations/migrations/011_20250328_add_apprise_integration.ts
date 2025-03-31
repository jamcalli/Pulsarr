import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // 1. Add Apprise settings to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('enableApprise').defaultTo(false)
    table.string('appriseUrl').defaultTo('http://localhost:8000')
    table.string('systemAppriseUrl').nullable()
  })
  
  // Set default values for existing rows
  await knex('configs')
    .whereNull('enableApprise')
    .update({ enableApprise: false })
  
  await knex('configs')
    .whereNull('appriseUrl')
    .update({ appriseUrl: 'http://localhost:8000' })
    
  // Migrate deleteSyncNotify values to new format
  // First, get all configs with the old values
  const configs = await knex('configs').select('id', 'deleteSyncNotify')
  
  // Then update them with the new values
  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let newValue = config.deleteSyncNotify
      
      // Only migrate if it's one of the old values
      if (['none', 'message', 'webhook', 'both'].includes(config.deleteSyncNotify)) {
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
  
  // 2. Modify users table to use Apprise instead of email
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

export async function down(knex: Knex): Promise<void> {
  // Revert notification format changes
  const configs = await knex('configs').select('id', 'deleteSyncNotify')
  
  // Then update them back to the old values
  for (const config of configs) {
    if (config.deleteSyncNotify) {
      let oldValue = config.deleteSyncNotify
      
      // Only migrate back if it's one of the new values
      if (['discord-message', 'discord-webhook', 'discord-both'].includes(config.deleteSyncNotify)) {
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
  
  // Revert changes to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('systemAppriseUrl') // Drop the system URL first
    table.dropColumn('enableApprise')
    table.dropColumn('appriseUrl')
  })
}