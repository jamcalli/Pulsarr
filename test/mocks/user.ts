import type { User } from '@root/types/config.types.js'

/**
 * Creates a mock User object with sensible defaults.
 * Only id and name vary between most test scenarios.
 */
export function createMockUser(
  id: number,
  name?: string | null,
  overrides?: Partial<Omit<User, 'id' | 'name'>>,
): User {
  return {
    id,
    name: name ?? `user_${id}`,
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: true,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}
