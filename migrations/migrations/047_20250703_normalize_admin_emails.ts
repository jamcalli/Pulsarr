import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE admin_users 
    SET email = LOWER(email), 
        updated_at = CURRENT_TIMESTAMP
    WHERE email != LOWER(email)
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // No practical way to restore original case without storing it
  console.log(
    'Note: Cannot restore original email case - normalized emails remain lowercase',
  )
}
