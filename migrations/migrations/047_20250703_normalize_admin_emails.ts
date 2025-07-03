import type { Knex } from 'knex'

/**
 * Normalizes existing admin user email addresses to lowercase for case-insensitive handling.
 * This ensures consistency with the updated email validation schemas that now convert emails to lowercase.
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
 * Reverts the email normalization by restoring original case.
 * Note: This down migration cannot perfectly restore the original case
 * since we don't store the original values. This is primarily for testing.
 */
export async function down(knex: Knex): Promise<void> {
  // No practical way to restore original case without storing it
  // This is primarily for testing rollback functionality
  console.log(
    'Note: Cannot restore original email case - normalized emails remain lowercase',
  )
}
