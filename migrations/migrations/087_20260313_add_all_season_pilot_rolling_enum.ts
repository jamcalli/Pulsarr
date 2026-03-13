import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds 'allSeasonPilotRolling' to the PostgreSQL monitoring_type enum.
 *
 * SQLite stores monitoring_type as text, so no changes needed there.
 */
export async function up(knex: Knex): Promise<void> {
  if (isPostgreSQL(knex)) {
    await knex.raw(`
      DO $$
      BEGIN
        ALTER TYPE monitoring_type ADD VALUE IF NOT EXISTS 'allSeasonPilotRolling';
      END
      $$;
    `)
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Cannot remove enum values in PostgreSQL without recreating the type
}
