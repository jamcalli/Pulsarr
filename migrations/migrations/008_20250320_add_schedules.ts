import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Creates the `schedules` table and inserts a default disabled cron schedule.
 *
 * The table includes columns for schedule metadata, configuration, status, and timestamps, with indexes on `name` and `enabled`. A default schedule named 'delete-sync' is added to run every Sunday at 1:00 AM.
 *
 * @remark
 * This migration is skipped when running against PostgreSQL.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '008_20250320_add_schedules')) {
    return
  }
  await knex.schema.createTable('schedules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique() // Unique name for the scheduled job
    table.string('type').notNullable() // 'interval' or 'cron'
    table.json('config').notNullable() // Configuration for the schedule
    table.boolean('enabled').defaultTo(true)
    table.json('last_run').nullable() // Info about last execution
    table.json('next_run').nullable() // Expected next run time
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index('name')
    table.index('enabled')
  })

  // Add default delete-sync schedule
  await knex('schedules').insert([
    {
      name: 'delete-sync',
      type: 'cron',
      config: JSON.stringify({
        expression: '0 1 * * 0', // Every Sunday at 1:00 AM
      }),
      enabled: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ])
}

/**
 * Reverts the migration by dropping the `schedules` table, unless running on PostgreSQL.
 *
 * @remark
 * The operation is skipped on PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.dropTable('schedules')
}
