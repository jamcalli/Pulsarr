import { UserTestPayloadSchema } from '@root/schemas/notifications/test-notification.schema'
import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import type { components } from '@/types/api.js'

export type UserTestChannel =
  components['schemas']['UserTestPayload']['channel']

export const USER_TEST_CHANNELS = UserTestPayloadSchema.shape.channel.options

export const USER_TEST_CHANNEL_LABELS: Record<UserTestChannel, string> = {
  'discord-dm': 'Discord DM',
  apprise: 'Apprise',
  'plex-mobile': 'Plex mobile',
}

export function userTestChannelDisabled(
  user: UserPageData['user'],
  channel: UserTestChannel,
): boolean {
  if (channel === 'discord-dm') return !user.discord_id
  if (channel === 'apprise') return !user.apprise
  return false
}
