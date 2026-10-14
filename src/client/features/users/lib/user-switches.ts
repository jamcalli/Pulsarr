import type { paths } from '@/types/api.js'

type UserUpdates =
  paths['/v1/users/bulk']['patch']['requestBody']['content']['application/json']['updates']

export const USER_SWITCHES = [
  'notify_discord',
  'notify_discord_mention',
  'notify_apprise',
  'notify_plex_mobile',
  'can_sync',
  'requires_approval',
] as const satisfies ReadonlyArray<keyof UserUpdates>

export type UserSwitch = (typeof USER_SWITCHES)[number]

export const USER_SWITCH_LABELS: Record<UserSwitch, string> = {
  notify_discord: 'Discord',
  notify_discord_mention: 'Discord mention',
  notify_apprise: 'Apprise',
  notify_plex_mobile: 'Plex mobile',
  can_sync: 'Sync watchlist',
  requires_approval: 'Require approval',
}

export const DISCORD_ID_REQUIRED = 'Add a Discord id to turn this on.'
