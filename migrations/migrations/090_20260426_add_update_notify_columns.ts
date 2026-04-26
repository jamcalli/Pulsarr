import type { Knex } from 'knex'

/**
 * Adds opt-in update-notification columns to the configs table.
 *
 * - `notifyOnUpdate`: boolean flag, default false. When true, Pulsarr will send
 *   a one-shot system notification (Discord webhook + Apprise system endpoint)
 *   when a newer GitHub release is detected by the daily update-check job.
 * - `lastNotifiedVersion`: nullable string. Stores the highest version we have
 *   already notified about, so we never re-notify for the same release.
 *
 * Defaults preserve existing behavior: notifications stay off until the user
 * explicitly opts in.
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
