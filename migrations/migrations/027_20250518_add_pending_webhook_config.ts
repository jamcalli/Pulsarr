import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Check if the configs table exists
  const configsExists = await knex.schema.hasTable('configs')
  
  if (configsExists) {
    const columnsToAdd = {
      pendingWebhookRetryInterval: { type: 'integer', defaultValue: 20 },
      pendingWebhookMaxAge: { type: 'integer', defaultValue: 10 },
      pendingWebhookCleanupInterval: { type: 'integer', defaultValue: 60 }
    }
    
    // Check and add each column if it doesn't exist
    for (const [columnName, config] of Object.entries(columnsToAdd)) {
      const columnExists = await knex.schema.hasColumn('configs', columnName)
      
      if (!columnExists) {
        await knex.schema.alterTable('configs', (table) => {
          table.integer(columnName).defaultTo(config.defaultValue)
        })
        
        // Set default values for existing rows
        await knex('configs')
          .whereNull(columnName)
          .update({ [columnName]: config.defaultValue })
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const configsExists = await knex.schema.hasTable('configs')
  
  if (configsExists) {
    const columnsToDrop = [
      'pendingWebhookRetryInterval',
      'pendingWebhookMaxAge',
      'pendingWebhookCleanupInterval'
    ]
    
    for (const columnName of columnsToDrop) {
      const columnExists = await knex.schema.hasColumn('configs', columnName)
      
      if (columnExists) {
        await knex.schema.alterTable('configs', (table) => {
          table.dropColumn(columnName)
        })
      }
    }
  }
}