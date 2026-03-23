import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  // Add watchlist cap notification columns to configs
  await knex.schema.alterTable('configs', (table) => {
    table.string('watchlistCapNotify').defaultTo('none')
    table.boolean('watchlistCapNotifyUser').defaultTo(false)
  })

  // Add 'watchlist_cap' to PostgreSQL notification_type enum
  if (isPostgreSQL(knex)) {
    await knex.raw(`
      DO $$
      BEGIN
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'watchlist_cap';
      END
      $$;
    `)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('watchlistCapNotify')
    table.dropColumn('watchlistCapNotifyUser')
  })
  // Cannot remove enum values in PostgreSQL without recreating the type
}
