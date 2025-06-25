import type { Knex } from 'knex'

/**
 * Modifies the user_quotas table to support separate quotas for movies and shows.
 *
 * Changes:
 * - Adds content_type column to distinguish movie vs show quotas
 * - Removes unique constraint on user_id alone
 * - Adds new unique constraint on user_id + content_type
 * - Migrates existing quota data to both movie and show quotas
 */
export async function up(knex: Knex): Promise<void> {
  // Step 1: Create a new temporary table with the correct structure
  await knex.schema.createTable('user_quotas_new', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.enum('content_type', ['movie', 'show']).notNullable()
    table
      .enum('quota_type', ['daily', 'weekly_rolling', 'monthly'])
      .notNullable()
    table.integer('quota_limit').notNullable()
    table.boolean('bypass_approval').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    // New constraints
    table.unique(['user_id', 'content_type'])
    table.index(['user_id', 'quota_type'])
    table.index(['bypass_approval'])
    table.index(['content_type'])
  })

  // Step 2: Migrate existing data - duplicate each quota for both content types
  const existingQuotas = await knex('user_quotas').select('*')

  for (const quota of existingQuotas) {
    // Insert movie quota
    await knex('user_quotas_new').insert({
      user_id: quota.user_id,
      content_type: 'movie',
      quota_type: quota.quota_type,
      quota_limit: quota.quota_limit,
      bypass_approval: quota.bypass_approval,
      created_at: quota.created_at,
      updated_at: quota.updated_at,
    })

    // Insert show quota
    await knex('user_quotas_new').insert({
      user_id: quota.user_id,
      content_type: 'show',
      quota_type: quota.quota_type,
      quota_limit: quota.quota_limit,
      bypass_approval: quota.bypass_approval,
      created_at: quota.created_at,
      updated_at: knex.fn.now(),
    })
  }

  // Step 3: Replace old table with new table
  await knex.schema.dropTable('user_quotas')
  await knex.schema.renameTable('user_quotas_new', 'user_quotas')
}

/**
 * Reverts separate content quotas back to single quota per user.
 * WARNING: This will lose show quota data and keep only movie quotas.
 */
export async function down(knex: Knex): Promise<void> {
  // Step 1: Remove show quotas (keep only movie quotas)
  await knex('user_quotas').where('content_type', 'show').del()

  // Step 2: Remove constraints and content_type column
  await knex.schema.alterTable('user_quotas', (table) => {
    // Drop new constraints
    table.dropUnique(['user_id', 'content_type'])
    table.dropIndex(['content_type'])

    // Restore old unique constraint
    table.unique(['user_id'])

    // Remove content_type column
    table.dropColumn('content_type')
  })
}
