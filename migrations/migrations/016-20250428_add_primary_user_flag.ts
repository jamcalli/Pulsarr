import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Add a flag to identify the primary token user
    table.boolean('is_primary_token').defaultTo(false)
    
  })
  
  // For SQLite, create a unique index that only applies when is_primary_token = true
  await knex.raw(`
    CREATE UNIQUE INDEX idx_unique_primary_token ON users (is_primary_token) 
    WHERE is_primary_token = 1
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop the unique index
  await knex.raw(`DROP INDEX IF EXISTS idx_unique_primary_token`)
  
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_primary_token')
  })
}