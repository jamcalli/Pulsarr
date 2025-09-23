import type { Knex } from 'knex'

/**
 * Creates a system user (ID: 0) for auto-approval tracking.
 *
 * The system user is used to initially attribute auto-approved content before
 * reconciliation updates the records with actual user attribution. This provides
 * a complete audit trail for all content additions.
 */
export async function up(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    // Insert system user with ID 0; idempotent across reruns
    await trx('users')
      .insert({
        id: 0,
        name: 'System',
        apprise: null,
        alias: null,
        discord_id: null,
        notify_apprise: false,
        notify_discord: false,
        notify_tautulli: false,
        tautulli_notifier_id: null,
        can_sync: false,
        is_primary_token: false,
        requires_approval: false,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .onConflict('id')
      .ignore()
  })
}

/**
 * Prevents rollback of the migration that creates the system user (ID 0).
 *
 * This down migration is intentionally irreversible and always throws. The system
 * user may be referenced by auto-approval or other persistent data, so removing
 * it could break referential integrity.
 *
 * @throws Error indicating the migration cannot be reversed
 */
export async function down(_: Knex): Promise<void> {
  throw new Error(
    'Irreversible: system user (ID 0) may be referenced by auto-approval data.',
  )
}
