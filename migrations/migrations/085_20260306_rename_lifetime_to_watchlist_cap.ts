import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Renames lifetime quota columns to watchlist cap.
 *
 * Migration 084 always runs first (Knex guarantees ordering), so the old
 * column names are guaranteed to exist by the time this migration executes.
 *
 * Neither `user_quotas` nor `configs` are foreign key parents (no CASCADE children),
 * so renameColumn is safe regardless of whether Knex uses native ALTER TABLE RENAME
 * or the table-rebuild path on SQLite.
 *
 * Column renames:
 * - user_quotas: `lifetime_limit` → `watchlist_cap`
 * - configs: `newUserDefaultMovieLifetimeLimit` → `newUserDefaultMovieWatchlistCap`
 * - configs: `newUserDefaultShowLifetimeLimit` → `newUserDefaultShowWatchlistCap`
 *
 * Data cleanup:
 * - Deletes approval_requests where router_decision contains quotaType: 'lifetime'
 *   (only affects beta testers who ran the lifetime quota feature)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_quotas', (table) => {
    table.renameColumn('lifetime_limit', 'watchlist_cap')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn(
      'newUserDefaultMovieLifetimeLimit',
      'newUserDefaultMovieWatchlistCap',
    )
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn(
      'newUserDefaultShowLifetimeLimit',
      'newUserDefaultShowWatchlistCap',
    )
  })

  // Delete approval records with quotaType: 'lifetime' in their router_decision.
  // Only beta testers will have these — non-beta users have zero matching rows.
  if (isPostgreSQL(knex)) {
    await knex('approval_requests')
      .whereRaw(
        "router_decision::jsonb #>> '{approval,data,quotaType}' = 'lifetime'",
      )
      .delete()
  } else {
    await knex('approval_requests')
      .whereRaw(
        "json_extract(router_decision, '$.approval.data.quotaType') = 'lifetime'",
      )
      .delete()
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_quotas', (table) => {
    table.renameColumn('watchlist_cap', 'lifetime_limit')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn(
      'newUserDefaultMovieWatchlistCap',
      'newUserDefaultMovieLifetimeLimit',
    )
  })

  await knex.schema.alterTable('configs', (table) => {
    table.renameColumn(
      'newUserDefaultShowWatchlistCap',
      'newUserDefaultShowLifetimeLimit',
    )
  })
}
