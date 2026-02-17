import type { Knex } from 'knex'

/**
 * Seed data for users table
 * Represents different notification preference combinations for testing
 *
 * Schema reference:
 * - id: integer (primary key)
 * - name: string (not null)
 * - apprise: string (nullable)
 * - alias: string (nullable)
 * - discord_id: string (nullable)
 * - notify_apprise: boolean (default: false)
 * - notify_discord: boolean (default: false)
 * - notify_discord_mention: boolean (default: true)
 * - notify_plex_mobile: boolean (default: false)
 * - can_sync: boolean (default: true)
 * - is_primary_token: boolean (default: false, unique constraint when true)
 * - requires_approval: boolean (default: false)
 * - created_at: timestamp
 * - updated_at: timestamp
 */

export const SEED_USERS = [
  {
    id: 1,
    name: 'test-user-primary',
    apprise: null,
    alias: 'Primary Test User',
    discord_id: '111111111111111111',
    notify_apprise: false,
    notify_discord: true,
    notify_discord_mention: true,
    notify_plex_mobile: false,
    can_sync: true,
    is_primary_token: true, // Only one user can have this as true
    requires_approval: false,
  },
  {
    id: 2,
    name: 'test-user-discord-apprise',
    apprise: 'mailto://user2@example.com',
    alias: 'Discord+Apprise User',
    discord_id: '222222222222222222',
    notify_apprise: true,
    notify_discord: true,
    notify_discord_mention: false, // Opted out of public mentions
    notify_plex_mobile: false,
    can_sync: true,
    is_primary_token: false,
    requires_approval: false,
  },
  {
    id: 3,
    name: 'test-user-all-notifications',
    apprise: 'mailto://user3@example.com',
    alias: 'All Notifications User',
    discord_id: null,
    notify_apprise: true,
    notify_discord: false,
    notify_discord_mention: true,
    notify_plex_mobile: true,
    can_sync: true,
    is_primary_token: false,
    requires_approval: false,
  },
  {
    id: 4,
    name: 'test-user-no-sync',
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: true,
    notify_plex_mobile: false,
    can_sync: false,
    is_primary_token: false,
    requires_approval: true,
  },
]

/**
 * Seed data for admin_users table
 * One admin user for testing admin-only functionality
 *
 * Schema reference:
 * - id: integer (primary key)
 * - username: string (not null, unique)
 * - password: string (not null)
 * - email: string (not null, unique)
 * - role: string (not null)
 * - created_at: timestamp
 * - updated_at: timestamp
 */
export const SEED_ADMIN_USERS = [
  {
    id: 1,
    username: 'testadmin',
    // Password: "testpassword123" (hashed using the same format as production)
    // Format: salt.hash (you may need to generate this with your actual hashing function)
    password:
      '686cc1b05c02accf4165c621f87a1338.4ffc8e602398a6d55ddcc7803916a3a400117112afe9bfc2e3668ba3a5ebdc9d',
    email: 'testadmin@example.com',
    role: 'admin',
  },
]

/**
 * Seeds the users and admin_users tables
 */
export async function seedUsers(knex: Knex): Promise<void> {
  // Insert users - SQLite will respect explicit IDs
  await knex('users').insert(SEED_USERS)
  await knex('admin_users').insert(SEED_ADMIN_USERS)

  // Update sqlite_sequence to ensure future auto-increments start after our seed data
  // This is necessary because SQLite's autoincrement doesn't automatically update
  // when you insert with explicit IDs
  const maxUserId = Math.max(...SEED_USERS.map((u) => u.id))
  const maxAdminId = Math.max(...SEED_ADMIN_USERS.map((u) => u.id))

  await knex.raw(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('users', ?), ('admin_users', ?)`,
    [maxUserId, maxAdminId],
  )
}
