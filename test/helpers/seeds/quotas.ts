import type { Knex } from 'knex'

/**
 * Seed data for user_quotas table
 *
 * Schema reference:
 * - id: integer (primary key)
 * - user_id: integer (not null, foreign key to users.id)
 * - content_type: enum ('movie', 'show')
 * - quota_type: enum ('daily', 'weekly_rolling', 'monthly')
 * - quota_limit: integer (not null)
 * - bypass_approval: boolean (default: false)
 * - watchlist_cap: integer (nullable)
 * - created_at: timestamp
 * - updated_at: timestamp
 *
 * Note: user_id + content_type must be unique
 */
export interface UserQuotaSeed {
  user_id: number
  content_type: 'movie' | 'show'
  quota_type?: 'daily' | 'weekly_rolling' | 'monthly'
  quota_limit?: number
  bypass_approval?: boolean
  watchlist_cap?: number | null
}

/**
 * Seeds a user_quotas row. Not part of seedAll() - quota tests opt in per test.
 */
export async function seedUserQuota(
  knex: Knex,
  quota: UserQuotaSeed,
): Promise<void> {
  await knex('user_quotas').insert({
    user_id: quota.user_id,
    content_type: quota.content_type,
    quota_type: quota.quota_type ?? 'daily',
    quota_limit: quota.quota_limit ?? 1,
    bypass_approval: quota.bypass_approval ?? false,
    watchlist_cap: quota.watchlist_cap ?? null,
  })
}
