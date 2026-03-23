import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds missing notification_type enum values for new notification events:
 * - watchlist_removed: When user removes content from watchlist
 * - approval_resolved: When an approval request is approved/denied
 * - approval_auto: When content is auto-approved
 * - user_created: When a new user is added
 *
 * SQLite doesn't have true enums, so no changes needed there.
 */
export async function up(knex: Knex): Promise<void> {
  if (isPostgreSQL(knex)) {
    // Add new enum values (PostgreSQL only)
    // Using IF NOT EXISTS pattern via exception handling
    await knex.raw(`
      DO $$
      BEGIN
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'watchlist_removed';
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'approval_resolved';
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'approval_auto';
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'user_created';
      END
      $$;
    `)
  }
  // SQLite: No action needed - columns store text values directly
}

/**
 * Note: PostgreSQL does not support removing enum values directly.
 * Rollback would require recreating the entire enum type and updating all references.
 * Since these values don't break existing functionality, we leave them in place.
 */
export async function down(_knex: Knex): Promise<void> {
  // Cannot remove enum values in PostgreSQL without recreating the type
  // This is intentionally a no-op as the values are harmless if unused
}
