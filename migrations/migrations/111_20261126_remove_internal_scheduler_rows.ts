import type { Knex } from 'knex'

const REMOVED_JOB_NAMES = [
  'pending-webhooks-processor',
  'pending-webhooks-cleanup',
  'pending-label-sync-processor',
  'pending-label-sync-cleanup',
  'periodic-watchlist-reconciliation',
  'imdb-update',
]

export async function up(knex: Knex): Promise<void> {
  await knex('schedules').whereIn('name', REMOVED_JOB_NAMES).delete()
}

export async function down(_knex: Knex): Promise<void> {
  // No code reads a row for any of these jobs any more, so there is nothing to restore.
}
