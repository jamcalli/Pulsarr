import type { Knex } from 'knex'

/**
 * Adds notifyOnUpdate and lastNotifiedVersion columns to configs table.
 *
 * notifyOnUpdate is the user-facing toggle for out-of-app update notifications
 * (Discord webhook + Apprise) when a new Pulsarr release is available. Defaults
 * to false so existing installs are not opted in silently.
 *
 * lastNotifiedVersion is internal bookkeeping used by the update-check plugin
 * to dedupe notifications across cron ticks. Nullable; managed exclusively via
 * dedicated DatabaseService methods (not exposed on the config update API).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('notifyOnUpdate').notNullable().defaultTo(false)
    table.string('lastNotifiedVersion').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('lastNotifiedVersion')
    table.dropColumn('notifyOnUpdate')
  })
}
