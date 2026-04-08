import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(
      knex,
      '033_20250601_add_plex_rolling_auto_reset_schedule',
    )
  ) {
    return
  }
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

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex('schedules').where('name', 'plex-rolling-auto-reset').delete()
}
