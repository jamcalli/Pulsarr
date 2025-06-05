import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Inserts a disabled schedule entry named 'plex-rolling-auto-reset' into the 'schedules' table if it does not already exist.
 *
 * The schedule is configured as an interval type with a 24-hour interval and current timestamps for creation and update.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '033_20250601_add_plex_rolling_auto_reset_schedule')) {
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
      updated_at: knex.fn.now()
    })
  }
}

/**
 * Deletes the schedule entry named 'plex-rolling-auto-reset' from the schedules table.
 */
export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // Remove the schedule
  await knex('schedules')
    .where('name', 'plex-rolling-auto-reset')
    .delete()
}