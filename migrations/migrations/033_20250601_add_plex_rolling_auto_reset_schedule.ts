import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds a disabled 'plex-rolling-auto-reset' schedule to the 'schedules' table if it does not already exist.
 *
 * The schedule is set as an interval type with a 24-hour interval and current timestamps for creation and update.
 *
 * @remark Skips execution for PostgreSQL databases.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(
      knex,
      '033_20250601_add_plex_rolling_auto_reset_schedule',
    )
  ) {
    return
  }
  // Add the new schedule for automatic rolling monitor reset
  const existing = await knex('schedules')
    .where('name', 'plex-rolling-auto-reset')
    .first()

  if (!existing) {
    await knex('schedules').insert({
      name: 'plex-rolling-auto-reset',
      type: 'interval',
      config: JSON.stringify({ hours: 24 }), // Interval config: { hours: number }
      enabled: false, // Start disabled, user can enable via UI
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
  }
}

/**
 * Removes the 'plex-rolling-auto-reset' schedule entry from the 'schedules' table if it exists.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // Remove the schedule
  await knex('schedules').where('name', 'plex-rolling-auto-reset').delete()
}
