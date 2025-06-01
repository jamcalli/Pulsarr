import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add the new schedule for automatic rolling monitor reset
  await knex('schedules').insert({
    name: 'plex-rolling-auto-reset',
    type: 'interval',
    config: JSON.stringify({ hours: 24 }),
    enabled: false, // Start disabled, user can enable via UI
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove the schedule
  await knex('schedules')
    .where('name', 'plex-rolling-auto-reset')
    .delete()
}