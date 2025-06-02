import type { Knex } from 'knex'

/**
 * Inserts a disabled schedule entry named 'plex-rolling-auto-reset' into the 'schedules' table if it does not already exist.
 *
 * The schedule is configured as an interval type with a 24-hour interval and current timestamps for creation and update.
 */
export async function up(knex: Knex): Promise<void> {
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
  // Remove the schedule
  await knex('schedules')
    .where('name', 'plex-rolling-auto-reset')
    .delete()
}