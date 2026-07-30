import type { Knex } from 'knex'

/**
 * Adds per-instance skip-default-routing flag to radarr_instances and sonarr_instances.
 *
 * CRITICAL: Must run outside a transaction. Knex's SQLite dropColumn uses
 * PRAGMA foreign_keys = OFF before rebuilding the table, but SQLite silently
 * ignores this pragma inside a transaction. Without this config, the migration
 * runner wraps everything in BEGIN/COMMIT, causing DROP TABLE to fire
 * ON DELETE CASCADE and wipe all child table data (quotas, approvals, usage).
 */
export const config = { transaction: false }

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })
}
