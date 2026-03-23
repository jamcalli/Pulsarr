import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * PostgreSQL uses ALTER TYPE ADD VALUE on its native enum type.
 * SQLite needs the column-rename trick to expand the CHECK constraint
 * created by Knex's table.enum().
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
  } else {
    // Column-rename trick to expand the CHECK constraint from table.enum()
    // Knex already wraps this migration in a transaction, no need for an explicit one.
    // dropColumn is safe here because rolling_monitored_shows has no CASCADE children.
    await knex.schema.alterTable('rolling_monitored_shows', (table) => {
      table
        .enum('monitoring_type_new', [
          'pilotRolling',
          'firstSeasonRolling',
          'allSeasonPilotRolling',
        ])
        .notNullable()
        .defaultTo('pilotRolling')
    })

    await knex('rolling_monitored_shows').update({
      monitoring_type_new: knex.ref('monitoring_type'),
    })

    await knex.schema.alterTable('rolling_monitored_shows', (table) => {
      table.dropIndex(['monitoring_type'])
    })

    await knex.schema.alterTable('rolling_monitored_shows', (table) => {
      table.dropColumn('monitoring_type')
    })

    await knex.schema.alterTable('rolling_monitored_shows', (table) => {
      table.renameColumn('monitoring_type_new', 'monitoring_type')
    })

    await knex.schema.alterTable('rolling_monitored_shows', (table) => {
      table.index(['monitoring_type'])
    })
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Cannot remove enum values in PostgreSQL without recreating the type
  // SQLite rollback would require converting allSeasonPilotRolling rows first
}
