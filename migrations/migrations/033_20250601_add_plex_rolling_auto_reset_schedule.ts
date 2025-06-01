import type { Knex } from 'knex'

/**
 * Adds a new disabled schedule entry named 'plex-rolling-auto-reset' to the 'schedules' table if it does not already exist.
 *
 * The schedule is of type 'interval' with a 24-hour interval configuration. Timestamps are set to the current time.
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
      config: JSON.stringify({ hours: 24 }),
      enabled: false, // Start disabled, user can enable via UI
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    })
  }
}

/**
 * Removes the 'plex-rolling-auto-reset' schedule entry from the schedules table.
 */
export async function down(knex: Knex): Promise<void> {
  // Remove the schedule
  await knex('schedules')
    .where('name', 'plex-rolling-auto-reset')
    .delete()
}