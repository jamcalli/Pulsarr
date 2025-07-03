import type { Knex } from 'knex'

/**
 * Converts all admin user email addresses in the database to lowercase for consistency.
 *
 * Updates the `email` field and `updated_at` timestamp in the `admin_users` table for any records where the email is not already lowercase.
 */
export async function up(knex: Knex): Promise<void> {
  // Update all admin user emails to lowercase
  await knex.raw(`
    UPDATE admin_users 
    SET email = LOWER(email), 
        updated_at = CURRENT_TIMESTAMP
    WHERE email != LOWER(email)
  `)
}

/**
 * Handles the down migration for admin user email normalization.
 *
 * This function does not revert emails to their original case, as the original casing is not stored.
 * It logs a message indicating that the normalized lowercase emails remain unchanged.
 * Primarily intended for testing rollback behavior.
 */
export async function down(knex: Knex): Promise<void> {
  // No practical way to restore original case without storing it
  // This is primarily for testing rollback functionality
  console.log(
    'Note: Cannot restore original email case - normalized emails remain lowercase',
  )
}
