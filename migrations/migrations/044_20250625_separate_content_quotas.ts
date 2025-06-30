import type { Knex } from 'knex'

/**
 * Migrates the `user_quotas` table to support separate quota records for movies and shows.
 *
 * Creates a new table schema with a `content_type` column, duplicates each existing quota record for both 'movie' and 'show' types within a single transaction, updates constraints and indexes, and replaces the original table with the new structure.
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

  await knex.transaction(async (trx) => {
    for (const quota of existingQuotas) {
      // Insert movie quota
      await trx('user_quotas_new').insert({
        user_id: quota.user_id,
        content_type: 'movie',
        quota_type: quota.quota_type,
        quota_limit: quota.quota_limit,
        bypass_approval: quota.bypass_approval,
        created_at: quota.created_at,
        updated_at: quota.updated_at,
      })

      // Insert show quota
      await trx('user_quotas_new').insert({
        user_id: quota.user_id,
        content_type: 'show',
        quota_type: quota.quota_type,
        quota_limit: quota.quota_limit,
        bypass_approval: quota.bypass_approval,
        created_at: quota.created_at,
        updated_at: quota.updated_at,
      })
    }
  })

  // Step 3: Replace old table with new table
  await knex.schema.dropTable('user_quotas')
  await knex.schema.renameTable('user_quotas_new', 'user_quotas')
}

/**
 * Reverts the `user_quotas` table to its original schema, removing support for separate quotas by content type.
 *
 * Permanently deletes all quota records for shows, drops the `content_type` column and related constraints, and restores the unique constraint on `user_id` only.
 */
export async function down(knex: Knex): Promise<void> {
  // WARNING: This migration will permanently delete all show quota data
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
