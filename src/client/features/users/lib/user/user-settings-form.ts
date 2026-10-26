import type { components, paths } from '@/types/api.js'

type User = components['schemas']['UserWithFriendStatus']
type UserUpdate =
  paths['/v1/users/{id}']['patch']['requestBody']['content']['application/json']

export interface UserSettingsValues {
  alias: string
  discord_id: string
  apprise: string
  notify_discord: boolean
  notify_discord_mention: boolean
  notify_apprise: boolean
  notify_plex_mobile: boolean
  can_sync: boolean
  requires_approval: boolean
}

export function toSettingsValues(user: User): UserSettingsValues {
  return {
    alias: user.alias ?? '',
    discord_id: user.discord_id ?? '',
    apprise: user.apprise ?? '',
    notify_discord: user.notify_discord,
    notify_discord_mention: user.notify_discord_mention,
    notify_apprise: user.notify_apprise,
    notify_plex_mobile: user.notify_plex_mobile,
    can_sync: user.can_sync,
    requires_approval: user.requires_approval,
  }
}

type SettingsUpdate = Required<Omit<UserUpdate, 'name'>>

const SETTINGS_KEYS = [
  'alias',
  'discord_id',
  'apprise',
  'notify_discord',
  'notify_discord_mention',
  'notify_apprise',
  'notify_plex_mobile',
  'can_sync',
  'requires_approval',
] as const satisfies ReadonlyArray<keyof SettingsUpdate>

function copyField<K extends keyof SettingsUpdate>(
  target: Partial<SettingsUpdate>,
  source: SettingsUpdate,
  key: K,
) {
  target[key] = source[key]
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toUpdate(values: UserSettingsValues): SettingsUpdate {
  const discordId = blankToNull(values.discord_id)
  const apprise = blankToNull(values.apprise)
  return {
    alias: blankToNull(values.alias),
    discord_id: discordId,
    apprise,
    notify_discord: values.notify_discord && discordId !== null,
    notify_discord_mention: values.notify_discord_mention && discordId !== null,
    notify_apprise: values.notify_apprise && apprise !== null,
    notify_plex_mobile: values.notify_plex_mobile,
    can_sync: values.can_sync,
    requires_approval: values.requires_approval,
  }
}

/** Only the fields that differ from the saved user, with a channel switched off when its address is blank. */
export function settingsUpdate(
  values: UserSettingsValues,
  user: User,
): UserUpdate {
  const next = toUpdate(values)
  const saved = toUpdate(toSettingsValues(user))
  const update: Partial<SettingsUpdate> = {}
  for (const key of SETTINGS_KEYS) {
    if (next[key] !== saved[key]) copyField(update, next, key)
  }
  return update
}
