import type { Knex } from 'knex'

/**
 * Renames Tautulli integration columns to Plex Mobile across users, notifications, and configs tables.
 *
 * - users: `notify_tautulli` → `notify_plex_mobile`, drops `tautulli_notifier_id`
 * - notifications: `sent_to_tautulli` → `sent_to_plex_mobile`
 * - configs: `tautulliEnabled` → `plexMobileEnabled`, drops `tautulliUrl` and `tautulliApiKey`
 *
 * Preserves all existing user notification preferences during the rename.
 *
 * CRITICAL: Must run outside a transaction. Knex's SQLite dropColumn uses
 * PRAGMA foreign_keys = OFF before rebuilding the table, but SQLite silently
 * ignores this pragma inside a transaction. Without this config, the migration
 * runner wraps everything in BEGIN/COMMIT, causing DROP TABLE to fire
 * ON DELETE CASCADE and wipe all child table data (quotas, approvals, usage).
 */
export const config = { transaction: false }
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('notify_tautulli', 'notify_plex_mobile')
  })

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('tautulli_notifier_id')
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.renameColumn('sent_to_tautulli', 'sent_to_plex_mobile')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn('tautulliEnabled', 'plexMobileEnabled')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tautulliUrl')
    table.dropColumn('tautulliApiKey')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('tautulliUrl').nullable()
    table.string('tautulliApiKey').nullable()
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn('plexMobileEnabled', 'tautulliEnabled')
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.renameColumn('sent_to_plex_mobile', 'sent_to_tautulli')
  })

  await knex.schema.alterTable('users', (table) => {
    table.integer('tautulli_notifier_id').nullable()
  })

  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('notify_plex_mobile', 'notify_tautulli')
  })
}
