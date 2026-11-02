import type { User } from '@root/types/config.types.js'

interface UserRow {
  id: number
  name: string
  apprise: string | null
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean | number
  notify_discord: boolean | number
  notify_discord_mention: boolean | number
  notify_plex_mobile: boolean | number
  can_sync: boolean | number
  requires_approval: boolean | number
  is_primary_token: boolean | number
  plex_uuid: string | null
  avatar: string | null
  display_name: string | null
  friend_created_at: string | null
  created_at: string
  updated_at: string
}

export function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    apprise: row.apprise,
    alias: row.alias,
    discord_id: row.discord_id,
    notify_apprise: Boolean(row.notify_apprise),
    notify_discord: Boolean(row.notify_discord),
    notify_discord_mention: Boolean(row.notify_discord_mention),
    notify_plex_mobile: Boolean(row.notify_plex_mobile),
    can_sync: Boolean(row.can_sync),
    requires_approval: Boolean(row.requires_approval),
    is_primary_token: Boolean(row.is_primary_token),
    plex_uuid: row.plex_uuid,
    avatar: row.avatar,
    display_name: row.display_name,
    friend_created_at: row.friend_created_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
